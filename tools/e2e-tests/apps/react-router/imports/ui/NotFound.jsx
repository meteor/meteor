import React from 'react';
import { Link } from 'react-router-dom';

export const NotFound = () => (
  <div>
    <h1>404 - Page Not Found</h1>
    <p>The page you are looking for does not exist.</p>
    <Link to="/">Go back to home</Link>
  </div>
);
