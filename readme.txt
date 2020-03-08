This webapp is setup with nextjs, so you'll have to have it installed. You can set up everything with:
npm install --save react react-dom next

Change the env values in next.config.js to your corresponding secret/publishable keys

Start the dev server with:
npm run dev 

navigate to "http://localhost:3000". Pressing the 'checkout' button creates a new paymentIntent each time. 

The webhook URL is /api/webhooks. Set up the stripe listener with the following:
stripe listen --forward-to localhost:3000/api/webhooks
