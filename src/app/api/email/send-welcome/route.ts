
import { type NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import WelcomeEmail from '@/emails/welcome-email'; // Adjust path as necessary

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { to, userName } = body;

    if (!process.env.RESEND_API_KEY) {
      console.error('RESEND_API_KEY is not set.');
      return NextResponse.json({ error: 'Email service is not configured.' }, { status: 500 });
    }

    if (!to) {
      return NextResponse.json({ error: 'Recipient email ("to") is required.' }, { status: 400 });
    }
    if (!userName) {
      return NextResponse.json({ error: 'User name ("userName") is required.' }, { status: 400 });
    }

    // In a real app, you might want to set a default "from" address
    // that is verified with Resend.
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'AgriAssist <onboarding@resend.dev>';

    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: [to],
      subject: `Welcome to AgriAssist, ${userName}!`,
      react: WelcomeEmail({ userName: userName, appName: 'AgriAssist' }) as React.ReactElement,
    });

    if (error) {
      console.error('Resend API Error:', error);
      return NextResponse.json({ error: error.message || 'Failed to send email.' }, { status: 500 });
    }

    return NextResponse.json({ message: 'Welcome email sent successfully!', data }, { status: 200 });

  } catch (e) {
    console.error('Error in send-welcome API route:', e);
    const errorMessage = e instanceof Error ? e.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
