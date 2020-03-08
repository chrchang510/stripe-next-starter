import fetch from 'isomorphic-unfetch';
import CheckoutForm from './CheckoutForm';
import {Elements} from '@stripe/react-stripe-js';
import {loadStripe} from '@stripe/stripe-js';

const stripePromise = loadStripe(process.env.STRIPE_PUBLISHABLE_KEY);

const Checkout = props => {
    return (
      <div style={{ width: '500px'}}>
        <Elements stripe={stripePromise}>
          <CheckoutForm clientSecret={props.clientSecret}/>
        </Elements>
      </div>
      );
};

Checkout.getInitialProps = async function({ req }) {
    const res = await fetch(`http://localhost:3000/api/build-checkout`);
    const data = await res.json();
    return {
      clientSecret: data.clientSecret
    };
  };
  
  export default Checkout;