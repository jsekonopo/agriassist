
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
  Link,
} from '@react-email/components';
import * as React from 'react';

interface StaffInvitationEmailProps {
  invitedUserEmail?: string;
  inviterName?: string;
  farmName?: string;
  appName?: string;
  invitationLink?: string; // Link to the profile page or a specific acceptance page
}

const baseUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'http://localhost:9002'; // Adjust if your dev port is different

export const StaffInvitationEmail = ({
  invitedUserEmail,
  inviterName = 'A farm owner',
  farmName = 'a farm',
  appName = 'AgriAssist',
  invitationLink = `${baseUrl}/profile`, // Default to profile page
}: StaffInvitationEmailProps) => {
  const previewText = `You've been invited to join ${farmName} on ${appName}!`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Tailwind
        config={{
          theme: {
            extend: {
              colors: {
                primary: '#16a34a', 
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
                src={`${baseUrl}/static/agriassist-logo.png`}
                width="80"
                height="80"
                alt={`${appName} Logo`}
                data-ai-hint="logo agriculture"
                className="my-0 mx-auto"
              />
            </Section>
            <Section className="text-center mt-[32px] mb-[32px]">
              <Text className="text-black text-[24px] font-bold">
                You&apos;re Invited!
              </Text>
            </Section>
            <Text className="text-black text-[14px] leading-[24px]">
              Hello {invitedUserEmail ? invitedUserEmail.split('@')[0] : 'there'},
            </Text>
            <Text className="text-black text-[14px] leading-[24px]">
              {inviterName} has invited you to join their farm, **{farmName}**, on {appName}.
            </Text>
            <Text className="text-black text-[14px] leading-[24px]">
              {appName} helps farmers manage their operations, track resources, and gain valuable insights. By accepting this invitation, you&apos;ll be able to collaborate with {inviterName} on {farmName}.
            </Text>
            <Section className="text-center mt-[32px] mb-[32px]">
              <Button
                className="bg-primary rounded text-white text-[12px] font-semibold no-underline text-center px-5 py-3"
                href={invitationLink}
              >
                View Invitation & Join Farm
              </Button>
            </Section>
            <Text className="text-black text-[14px] leading-[24px]">
              If you don&apos;t have an {appName} account yet, you&apos;ll be prompted to create one. Once logged in, you should see the pending invitation on your profile page.
            </Text>
            <Text className="text-black text-[14px] leading-[24px]">
              If you were not expecting this invitation, you can safely ignore this email.
            </Text>
            <Hr className="border border-solid border-[#eaeaea] my-[26px] mx-0 w-full" />
            <Text className="text-[#666666] text-[12px] leading-[24px]">
              This email was intended for <span className="text-black">{invitedUserEmail}</span>.
            </Text>
             <Text className="text-[#666666] text-[12px] leading-[24px]">
              © {new Date().getFullYear()} {appName}. All rights reserved. If you have questions, please visit our support page (link to be added).
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default StaffInvitationEmail;
