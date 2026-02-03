import { Counter } from "./Counter.jsx";
import { Header } from "./Header.jsx";
import { Info } from "./Info.jsx";

export const App = () => (
  <div className="page">
    <Header />
    <main className="main">
      <Counter />
      <Info />
    </main>
  </div>
);
