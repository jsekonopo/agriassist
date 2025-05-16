
import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
  Tailwind,
} from '@react-email/components';
import * as React from 'react';

interface WelcomeEmailProps {
  userName?: string;
  appName?: string;
  appUrl?: string;
}

const baseUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'http://localhost:9002'; // Adjust if your dev port is different

export const WelcomeEmail = ({
  userName = 'Farmer',
  appName = 'AgriAssist',
  appUrl = baseUrl,
}: WelcomeEmailProps) => {
  const previewText = `Welcome to ${appName}!`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Tailwind
        config={{
          theme: {
            extend: {
              colors: {
                primary: '#16a34a', // Example primary color (green)
                background: '#f9fafb',
              },
            },
          },
        }}
      >
        <Body className="bg-background my-auto mx-auto font-sans">
          <Container className="border border-solid border-[#eaeaea] rounded my-[40px] mx-auto p-[20px] w-[465px]">
            <Section className="mt-[32px]">
              <Img
                src={`${baseUrl}/static/agriassist-logo.png`} // You'll need to add a logo image here
                width="80"
                height="80"
                alt={`${appName} Logo`}
                data-ai-hint="logo agriculture"
                className="my-0 mx-auto"
              />
            </Section>
            <Section className="text-center mt-[32px] mb-[32px]">
              <Text className="text-black text-[24px] font-bold">
                Welcome to {appName}, {userName}!
              </Text>
            </Section>
            <Text className="text-black text-[14px] leading-[24px]">
              Hello {userName},
            </Text>
            <Text className="text-black text-[14px] leading-[24px]">
              We're thrilled to have you join {appName}! Our platform is designed to help you manage your farm more efficiently, track resources, and gain valuable insights to boost productivity and sustainability.
            </Text>
            <Text className="text-black text-[14px] leading-[24px]">
              Here are a few things you can do to get started:
            </Text>
            <ul className="list-disc list-inside text-black text-[14px] leading-[24px] pl-[10px]">
              <li>Define your farm fields in the Data Management section.</li>
              <li>Start logging your planting and harvesting activities.</li>
              <li>Explore the AI Farm Expert for advice and insights.</li>
            </ul>
            <Section className="text-center mt-[32px] mb-[32px]">
              <Button
                className="bg-primary rounded text-white text-[12px] font-semibold no-underline text-center px-5 py-3"
                href={appUrl + '/dashboard'}
              >
                Go to your Dashboard
              </Button>
            </Section>
            <Text className="text-black text-[14px] leading-[24px]">
              If you have any questions or need assistance, don't hesitate to check out our help resources or contact support (once available).
            </Text>
            <Hr className="border border-solid border-[#eaeaea] my-[26px] mx-0 w-full" />
            <Text className="text-[#666666] text-[12px] leading-[24px]">
              This email was intended for <span className="text-black">{userName}</span>. If you were not expecting this email, you can ignore it.
            </Text>
             <Text className="text-[#666666] text-[12px] leading-[24px]">
              © {new Date().getFullYear()} {appName}. All rights reserved.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default WelcomeEmail;
