import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set in environment variables.');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20', // Use the latest API version
  typescript: true,
});

// Helper function to get the base URL of the application
export const getURL = () => {
  let url =
    process?.env?.NEXT_PUBLIC_APP_URL ?? // Set this to your site URL in production
    process?.env?.VERCEL_URL ?? // Automatically set by Vercel.
    'http://localhost:9002'; // Fallback to localhost for development
  // Make sure to include `https` in production URLs.
  url = url.includes('http') ? url : `https://${url}`;
  // Make sure to include a trailing `/`.
  // url = url.charAt(url.length - 1) === '/' ? url : `${url}/`;
  return url;
};
