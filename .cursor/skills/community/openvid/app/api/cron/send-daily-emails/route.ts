import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { resend } from "@/utils/resend/client";
import DailyTipEmail from "@/components/emails/DailyTipEmail";

const BATCH_SIZE = Number(process.env.EMAIL_BATCH_SIZE ?? 90);
const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ?? "Openvid <hi@openvid.dev>";
const REPLY_TO_EMAIL = process.env.RESEND_REPLY_TO ?? "oliverachavezcristian@gmail.com";

type EligibleUser = {
  id: string;
  email: string;
  first_name: string | null;
};

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: users, error: queryError } = await supabase
    .from("user_profiles")
    .select("id, email, first_name")
    .eq("email_opt_out", false)
    .or(`last_email_sent_at.is.null,last_email_sent_at.lt.${cutoff}`)
    .order("last_email_sent_at", { ascending: true, nullsFirst: true })
    .limit(BATCH_SIZE)
    .overrideTypes<EligibleUser[], { merge: false }>();

  if (queryError) {
    console.error("Error fetching users:", queryError);
    return NextResponse.json({ error: queryError.message }, { status: 500 });
  }

  if (!users || users.length === 0) {
    return NextResponse.json({ message: "No eligible users found today", sent: 0 });
  }

  const emails = users.map((user: EligibleUser) => ({
    from: FROM_EMAIL,
    to: [user.email],
    reply_to: REPLY_TO_EMAIL,
    subject: user.first_name ? `${user.first_name}, transform your recordings into 3D mockups today` : "Transform your recordings into 3D mockups today",
    react: DailyTipEmail({ firstName: user.first_name }),
  }));

  const { data: batchData, error: sendError } = await resend.batch.send(emails);

  if (sendError) {
    console.error("Error sending batch:", sendError);
    return NextResponse.json({ error: sendError.message }, { status: 500 });
  }

  const sentIds = users.map((u: EligibleUser) => u.id);
  const { error: updateError } = await supabase
    .from("user_profiles")
    .update({ last_email_sent_at: new Date().toISOString() })
    .in("id", sentIds);

  if (updateError) {
    console.error("Error updating last_email_sent_at:", updateError);
  }

  return NextResponse.json({
    message: "Emails sent successfully",
    sent: sentIds.length,
    resendIds: batchData?.data?.map((d) => d.id) ?? [],
  });
}