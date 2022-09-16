import React, { useState } from 'react';
import {Box, Button, Text} from "@chakra-ui/react";

export const Hello = () => {
  const [counter, setCounter] = useState(0);

  const increment = () => {
    setCounter(counter + 1);
  };

  return (
    <Box>
      <Button variant='outline' onClick={increment}>Click Me</Button>
      <Text fontSize={'xl'}>You've pressed the button {counter} times.</Text>
    </Box>
  );
};
