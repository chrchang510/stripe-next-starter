import { buffer } from 'micro';
import Cors from 'micro-cors';

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const webhookSecret = process.env.WEBHOOK_SECRET_KEY;

const cors = Cors({
    allowMethods: ['POST', 'HEAD']
  });

export const config = {
    api: {
        bodyParser: false,
    },
}
const webhookHandler = async (req, res) => {
    if (req.method === 'POST') {
        const buf = await buffer(req);
        const sig = req.headers['stripe-signature'];
        let event;

        try {
            event = stripe.webhooks.constructEvent(buf.toString(), sig, webhookSecret)
          } catch (err) {
            // On error, log and return the error message.
            console.log(`Error message: ${err.message}`);
            res.status(400).send(`Webhook Error: ${err.message}`);
            return;
        }
        if (event.type === 'payment_intent.succeeded') {
            var fs = require('fs');
            const values = event.data.object;
            fs.appendFile('log.txt', 'Payment with price ' + values.amount_received/100 +
                          ' paymentIntentID of ' + values.id + '\n', function (err) {
              if (err) throw err;
            });
        }
    }
    res.json({received: true});
}

export default cors(webhookHandler)