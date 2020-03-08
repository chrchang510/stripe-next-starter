This webapp is setup with nextjs, so you'll have to have it installed (along with a few other packages).
You can set up everything with:
npm install

Next, change the env values in next.config.js to your corresponding secret/publishable keys

Start the dev server with:
npm run dev 

The webhook URL is /api/webhooks. Set up the stripe listener with the following:
stripe listen --forward-to localhost:3000/api/webhooks

Navigate to 'http://localhost:3000'. Pressing the 'checkout' button creates a new paymentIntent each time, 
and logs the paymentIntentID and amount to a 'logs.txt' file. 

