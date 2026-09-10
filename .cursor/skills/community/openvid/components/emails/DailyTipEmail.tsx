import * as React from "react";
import {
    Html,
    Head,
    Preview,
    Body,
    Container,
    Section,
    Text,
    Img,
    Heading,
    Hr,
    Button,
    Link,
    Tailwind,
    Row,
    Column,
} from "react-email";

interface DailyTipEmailProps {
    firstName: string | null;
}

export default function DailyTipEmail({ firstName }: DailyTipEmailProps) {
    const greeting = firstName ? `Hi ${firstName},` : "Hi there!";

    return (
        <Html lang="en">
            <Tailwind>
                <Head />
                <Preview>A quick tip to make your product demos look way better.</Preview>
                <Body className="bg-[#f9fafb] my-auto mx-auto font-sans text-[#111827]">
                    <Container className="border border-solid border-[#e5e7eb] bg-white rounded-xl my-10 mx-auto p-8 max-w-[480px]">
                        <Section className="mb-6">
                            <Img
                                src="https://openvid.dev/svg/openvid-complete-light.svg"
                                height="32"
                                alt="Openvid Logo"
                                className="block"
                            />
                        </Section>

                        <Section className="mb-6">
                            <Img
                                src="https://openvid.dev/images/pages/banner-email.webp"
                                width="414"
                                height="233"
                                alt="3D Mockup Editor Preview"
                                className="block w-full rounded-lg border border-solid border-[#f3f4f6] object-cover"
                            />
                        </Section>

                        <Heading className="text-[#111827] text-[24px] font-medium p-0 mb-6 mx-0 tracking-tight">
                            Ready for your next demo?
                        </Heading>

                        <Text className="text-[#4b5563] text-[15px] leading-relaxed mb-4">
                            {greeting}
                        </Text>
                        <Text className="text-[#4b5563] text-[15px] leading-relaxed mb-4">
                            Next time you jump into the editor, try placing your recording inside
                            one of our 3D mockups and add a camera pan. It only takes a couple of
                            clicks, but the final output looks incredibly professional.
                        </Text>
                        <Text className="text-[#4b5563] text-[15px] leading-relaxed mb-6">
                            The best part is that everything runs directly in your browser, so you
                            can export the final result in 4K within seconds.
                        </Text>

                        <Section className="mb-8 mt-2">
                            <Button
                                href="https://openvid.dev/en/editor"
                                className="bg-[#111827] rounded-lg text-white text-[14px] font-medium no-underline px-6 py-3 block text-center"
                            >
                                Open the editor
                            </Button>
                        </Section>

                        <Hr className="border border-solid border-[#e5e7eb] my-6 mx-0 w-full" />

                        <Section>
                            <Row>
                                <Column align="left">
                                    <Link
                                        href="https://openvid.dev/en"
                                        className="text-[#6b7280] text-[13px] underline-offset-4 hover:text-[#374151] transition-colors"
                                    >
                                        Website
                                    </Link>
                                </Column>
                                <Column align="center">
                                    <Link
                                        href="https://discord.com/invite/aBu5A2tBXb"
                                        className="text-[#6b7280] text-[13px] underline-offset-4 hover:text-[#374151] transition-colors"
                                    >
                                        Discord
                                    </Link>
                                </Column>
                                <Column align="right">
                                    <Link
                                        href="https://github.com/CristianOlivera1/openvid"
                                        className="text-[#6b7280] text-[13px] underline-offset-4 hover:text-[#374151] transition-colors"
                                    >
                                        GitHub
                                    </Link>
                                </Column>
                            </Row>
                        </Section>
                    </Container>
                </Body>
            </Tailwind>
        </Html>
    );
}