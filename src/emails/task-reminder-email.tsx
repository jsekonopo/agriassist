
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

interface TaskReminderEmailProps {
  taskName?: string;
  dueDateFormatted?: string;
  taskMessage?: string; // This will contain the main body of the reminder
  actionLink?: string;
  appName?: string;
  appUrl?: string;
  recipientName?: string;
}

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9002';

export const TaskReminderEmail = ({
  taskName = 'A Farm Task',
  dueDateFormatted,
  taskMessage = 'A task requires your attention.',
  actionLink,
  appName = 'AgriAssist',
  appUrl = baseUrl,
  recipientName,
}: TaskReminderEmailProps) => {
  const previewText = `Reminder: ${taskName} is due soon!`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Tailwind
        config={{
          theme: {
            extend: {
              colors: {
                primary: '#8FBC8F', // Earthy Green
                background: '#F5F5DC', // Light Beige
              },
            },
          },
        }}
      >
        <Body className="bg-background my-auto mx-auto font-sans">
          <Container className="border border-solid border-[#eaeaea] rounded my-[40px] mx-auto p-[20px] w-[465px] bg-white shadow-sm">
            <Section className="mt-[20px] mb-[20px]">
              <Link href={appUrl} className="flex items-center justify-center">
                <Img
                  src={`${appUrl}/static/agriassist-logo.png`}
                  width="60"
                  height="60"
                  alt={`${appName} Logo`}
                  data-ai-hint="logo agriculture"
                  className="my-0 mx-auto"
                />
                <Text className="text-2xl font-semibold text-[#A0522D] ml-2">{appName}</Text>
              </Link>
            </Section>
            
            <Text className="text-black text-[18px] font-semibold text-center">
              Task Reminder: {taskName}
            </Text>

            <Text className="text-black text-[14px] leading-[24px]">
              Hello {recipientName || 'there'},
            </Text>

            <Text className="text-black text-[14px] leading-[24px] whitespace-pre-line">
              {taskMessage}
            </Text>

            {dueDateFormatted && (
                <Text className="text-black text-[14px] leading-[24px]">
                    **Due Date:** {dueDateFormatted}
                </Text>
            )}

            {actionLink && (
              <Section className="text-center mt-[32px] mb-[32px]">
                <Button
                  className="bg-primary rounded text-white text-[12px] font-semibold no-underline text-center px-5 py-3"
                  href={actionLink}
                >
                  View Task Details
                </Button>
              </Section>
            )}

            <Hr className="border border-solid border-[#eaeaea] my-[26px] mx-0 w-full" />
            <Text className="text-[#666666] text-[12px] leading-[24px]">
              This is an automated reminder from {appName}. You can manage your notification preferences in your account settings.
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

export default TaskReminderEmail;
