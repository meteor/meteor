import React from 'react';
import {Hello} from './Hello.jsx';
import {Info} from './Info.jsx';
import {ChakraProvider, ColorModeScript, extendTheme, Heading} from '@chakra-ui/react';

const theme = extendTheme({
  config: {
    initialColorMode: 'dark',
    useSystemColorMode: false,
  },
});

export const App = () => {
  return (
    <>
      <ColorModeScript initialColorMode={theme.config.initialColorMode}/>
      <ChakraProvider theme={theme}>
        <Heading as='h1' size='4xl'>Welcome to Meteor!</Heading>
        <Hello/>
        <Info/>
      </ChakraProvider>
    </>
  );
};
