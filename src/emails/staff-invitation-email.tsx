
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
import type { UserRole } from '@/contexts/auth-context'; // Import UserRole

interface StaffInvitationEmailProps {
  invitedUserEmail?: string;
  inviterName?: string;
  farmName?: string;
  appName?: string;
  invitationLink?: string; 
  role?: UserRole; // Add role
}

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9002';

export const StaffInvitationEmail = ({
  invitedUserEmail,
  inviterName = 'A farm owner',
  farmName = 'a farm',
  appName = 'AgriAssist',
  invitationLink = `${baseUrl}/profile`, 
  role = 'member' // Default role text if not provided
}: StaffInvitationEmailProps) => {
  const previewText = `You've been invited to join ${farmName} on ${appName} as a ${role}!`;

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
              {inviterName} has invited you to join their farm, **{farmName}**, on {appName} with the role of **{role}**.
            </Text>
            <Text className="text-black text-[14px] leading-[24px]">
              {appName} helps farmers manage their operations, track resources, and gain valuable insights. By accepting this invitation, you&apos;ll be able to collaborate with {inviterName} on {farmName}.
            </Text>
            <Section className="text-center mt-[32px] mb-[32px]">
              <Button
                className="bg-primary rounded text-white text-[12px] font-semibold no-underline text-center px-5 py-3"
                href={invitationLink}
              >
                Accept Invitation
              </Button>
            </Section>
            <Text className="text-black text-[14px] leading-[24px]">
              Click the button above to accept the invitation. If you don&apos;t have an {appName} account yet with the email <span className="font-semibold">{invitedUserEmail}</span>, you&apos;ll be guided to create one.
            </Text>
            <Text className="text-black text-[14px] leading-[24px]">
              If you were not expecting this invitation, you can safely ignore this email. This invitation link is unique to you and will expire in 7 days.
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
