import React from 'react';
import Router from 'next/router'

export default function Index() {
  return (
    <div>
        <div>Buy a hotdog</div>
        <button onClick={() => Router.push('/checkout')}>Checkout</button>
    </div>
  );
};