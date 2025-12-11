import { createSignal } from "solid-js";

export const Hello = () => {
  const [counter, setCounter] = createSignal(0);

  const increment = () => {
    setCounter(counter() + 1);
  };

  return (
    <div>
      <button onClick={increment}>Click Me</button>
      <p>You've pressed the button {counter()} times.</p>
    </div>
  );
}
