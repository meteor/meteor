import React, { useState } from 'react'

export Hello = ->
  [counter, setCounter] = useState(0)

  increment = ->
    setCounter(counter + 1)

  <div>
    <button onClick={increment}>Click Me</button>
    <p>You've pressed the button {counter} times.</p>
  </div>
