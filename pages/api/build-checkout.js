const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
export default async (req, res) => {
  const paymentIntent = await stripe.paymentIntents.create({
    amount: 1099,
    currency: 'usd',
    // Verify your integration in this guide by including this parameter
    metadata: {integration_check: 'accept_a_payment'},
  });

  res.send({
    clientSecret: paymentIntent.client_secret
  });
};