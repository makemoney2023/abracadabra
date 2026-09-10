import type { Metadata } from "next";
import { Icon } from "@iconify/react";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/navigation";
import { buildPageMetadata } from "@/lib/seo";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("privacy");
  const description = t.raw("intro.content") as string;

  return buildPageMetadata({
    locale,
    path: "/privacy",
    title: t("title"),
    description,
    imageAlt: "Openvid — Privacy Policy",
  });
}

export default async function PrivacyPage({ params }: Props) {
    const { locale } = await params;
    setRequestLocale(locale);
    const t = await getTranslations("privacy");
    const currentLocale = await getLocale();

    const lastUpdatedDate = new Date().toLocaleDateString(currentLocale, {
        day: "numeric",
        month: "long",
        year: "numeric",
    });

    return (
        <div className="min-h-screen bg-[#09090B] py-16 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto">
                <nav aria-label="Breadcrumb" className="mb-12">
                    <Link
                        href="/"
                        className="inline-flex items-center text-sm text-white/60 hover:text-white mb-8 transition-colors"
                        aria-label={t("backToHome")}
                    >
                        <Icon icon="lucide:arrow-left" width="16" className="mr-2" aria-hidden="true" />
                        {t("backToHome")}
                    </Link>
                </nav>
                <header className="mb-12">
                    <h1 className="text-3xl md:text-4xl font-semibold text-white mb-3">
                        {t("title")}
                    </h1>
                    <p className="text-white/60 text-sm">
                        {t("lastUpdated", { date: lastUpdatedDate })}

                    </p>
                </header>

                <main className="space-y-10 text-white/70 leading-relaxed">
                    <section>
                        <h2 className="text-xl font-medium text-white mb-4">
                            1. {t("intro.title")}
                        </h2>
                        <p>{t("intro.content")}</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-medium text-white mb-4">
                            2. {t("collection.title")}
                        </h2>
                        <p className="mb-3">{t("collection.content")}</p>
                        <ul className="list-disc list-inside space-y-2 ml-2">
                            {(t.raw("collection.items") as string[]).map((item, index) => (
                                <li key={index}>{item}</li>
                            ))}
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-medium text-white mb-4">
                            3. {t("usage.title")}
                        </h2>
                        <p className="mb-3">{t("usage.content")}</p>
                        <ul className="list-disc list-inside space-y-2 ml-2">
                            {(t.raw("usage.items") as string[]).map((item, index) => (
                                <li key={index}>{item}</li>
                            ))}
                        </ul>
                    </section>

                    <section>
                        <div className="flex items-start gap-3 p-4 bg-cyan-500/5 border border-cyan-500/20 squircle-element-camera mt-4">
                            <Icon
                                icon="lucide:cpu"
                                className="text-cyan-400 shrink-0 mt-0.5"
                                width="18"
                            />
                            <div>
                                <p className="text-white/80 font-semibold mb-1">
                                    {t("processing.title")}
                                </p>
                                <p className="text-cyan-400/80 text-sm leading-relaxed">
                                    {t("processing.badge")}
                                </p>
                            </div>
                        </div>
                    </section>

                    <section>
                        <h2 className="text-xl font-medium text-white mb-4">
                            4. {t("cookies.title")}
                        </h2>
                        <p className="mb-3">{t("cookies.content")}</p>
                        <ul className="list-disc list-inside space-y-2 ml-2 mb-3">
                            {(t.raw("cookies.items") as string[]).map((item, index) => (
                                <li key={index}>{item}</li>
                            ))}
                        </ul>
                        <p className="text-sm italic">{t("cookies.note")}</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-medium text-white mb-4">
                            5. {t("sharing.title")}
                        </h2>
                        <p className="mb-3">{t("sharing.content")}</p>
                        <ul className="list-disc list-inside space-y-2 ml-2">
                            {(t.raw("sharing.items") as string[]).map((item, index) => (
                                <li key={index}>{item}</li>
                            ))}
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-medium text-white mb-4">
                            6. {t("security.title")}
                        </h2>
                        <p className="mb-3">{t("security.content")}</p>
                        <ul className="list-disc list-inside space-y-2 ml-2">
                            {(t.raw("security.items") as string[]).map((item, index) => (
                                <li key={index}>{item}</li>
                            ))}
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-medium text-white mb-4">
                            7. {t("rights.title")}
                        </h2>
                        <p className="mb-3">{t("rights.content")}</p>
                        <ul className="list-disc list-inside space-y-2 ml-2">
                            {(t.raw("rights.items") as string[]).map((item, index) => (
                                <li key={index}>{item}</li>
                            ))}
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-medium text-white mb-4">
                            8. {t("children.title")}
                        </h2>
                        <p>{t("children.content")}</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-medium text-white mb-4">
                            9. {t("changes.title")}
                        </h2>
                        <p>{t("changes.content")}</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-medium text-white mb-4">
                            10. {t("contact.title")}
                        </h2>
                        <p>{t("contact.content")}</p>
                    </section>
                </main>

                <footer className="mt-16 pt-8 border-t border-white/10">
                    <p className="text-sm text-white/60">
                        {t.rich("acceptance.content", {
                            terms: (chunks) => (
                                <Link
                                    href="/terms"
                                    className="text-white hover:underline transition-colors"
                                >
                                    {chunks}
                                </Link>
                            ),
                        })}
                    </p>
                </footer>
            </div>
        </div>
    );
}