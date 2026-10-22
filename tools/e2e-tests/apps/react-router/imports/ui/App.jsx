import React, { Suspense, lazy } from "react";
import {
  createBrowserRouter,
  RouterProvider,
  Route,
  createRoutesFromElements,
} from "react-router-dom";
import "./Global.less";

// Dynamically import components
const Home = lazy(() =>
  import(/* webpackPrefetch: true */ "./Home.jsx").then((module) => ({ default: module.Home }))
);
const NotFound = lazy(() =>
  import("./NotFound.jsx").then((module) => ({ default: module.NotFound }))
);

// Create router with routes
const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route
        path="/"
        element={
          <Suspense fallback={<div>Loading...</div>}>
            <Home />
          </Suspense>
        }
      />
      <Route
        path="*"
        element={
          <Suspense fallback={<div>Loading...</div>}>
            <NotFound />
          </Suspense>
        }
      />
    </>
  )
);

export const App = () => <RouterProvider router={router} />;
