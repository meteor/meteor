# Flowbite UI with Tailwind CSS

Learn how to install Tailwind CSS with Flowbite for your Meteor.js project to build modern, responsive web applications.

## Introduction

[Flowbite](https://flowbite.com/) is an open-source library of UI components based on the utility-first Tailwind CSS framework featuring dark mode support, a Figma design system, templates, and more.

It includes all of the commonly used components that a website requires, such as buttons, dropdowns, navigation bars, modals, but also some more advanced interactive elements such as datepickers.

Using both Meteor.js, Tailwind CSS and Flowbite can help you get started building modern UI web applications by leveraging the extensive framework features of Meteor.js, the utility-first approach of the Tailwind CSS framework and the open-source UI components from the Flowbite Library.

## Requirements

Make sure that you have [Node.js v14](https://nodejs.org/en/) or newer installed on your computer to be able to install Meteor.js, Tailwind CSS and Flowbite using npm.

For more information on how to install Meteor.js, check out the [official installation guide](/about/install).

## Create a new Meteor project with Tailwind

The easiest way to create a new Meteor.js project with Tailwind CSS support is by using the `--tailwind` flag:

```bash
meteor create flowbite-app --tailwind
cd flowbite-app
```

This will create a new Meteor project with Tailwind CSS pre-configured. No extra configuration needed as we added the `--tailwind` flag when setting up the project.

Now that you have created a new Meteor.js project with Tailwind CSS configured automatically, we can proceed with installing Flowbite and Flowbite React to start leveraging the open-source UI components.

## Install Flowbite

1. Install Flowbite and Flowbite React via npm:

```bash
npm install --save flowbite flowbite-react
```

2. Make sure that you set up the Flowbite plugin and template paths in your `tailwind.config.js` file:

```js
module.exports = {
  content: [
    './imports/ui/**/*.{js,jsx,ts,tsx}',
    './client/*.html',
    'node_modules/flowbite-react/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [require('flowbite/plugin')],
};
```

3. Now that you have installed the packages you can start importing the UI components:

```jsx
import { Alert } from 'flowbite-react';

export default function MyPage() {
  return <Alert color="info">Alert!</Alert>;
}
```

The code above will import the `<Alert>` component that you can use to send feedback messages.

## Example components

To get you started, here are some examples of how to use Flowbite components in your Meteor.js project.

### Modal with Button

```jsx
import { useState } from 'react';
import { Button, Modal } from 'flowbite-react';

export default function DefaultModal() {
  const [openModal, setOpenModal] = useState(false);

  return (
    <>
      <Button onClick={() => setOpenModal(true)}>Toggle modal</Button>
      <Modal show={openModal} onClose={() => setOpenModal(false)}>
        <Modal.Header>Terms of Service</Modal.Header>
        <Modal.Body>
          <div className="space-y-6">
            <p className="text-base leading-relaxed text-gray-500 dark:text-gray-400">
              With less than a month to go before the European Union enacts new consumer privacy laws for its citizens,
              companies around the world are updating their terms of service agreements to comply.
            </p>
            <p className="text-base leading-relaxed text-gray-500 dark:text-gray-400">
              The European Union's General Data Protection Regulation (G.D.P.R.) goes into effect on May 25 and is meant to
              ensure a common set of data rights in the European Union.
            </p>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={() => setOpenModal(false)}>I accept</Button>
          <Button color="gray" onClick={() => setOpenModal(false)}>
            Decline
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
```

### Dropdown

```jsx
import { Dropdown } from 'flowbite-react';

export default function DropdownExample() {
  return (
    <Dropdown label="Dropdown button">
      <Dropdown.Item>Dashboard</Dropdown.Item>
      <Dropdown.Item>Settings</Dropdown.Item>
      <Dropdown.Item>Earnings</Dropdown.Item>
      <Dropdown.Item>Sign out</Dropdown.Item>
    </Dropdown>
  );
}
```

### Navbar

```jsx
import { Navbar } from 'flowbite-react';

export default function NavbarExample() {
  return (
    <Navbar fluid={true} rounded={true}>
      <Navbar.Brand href="/">
        <img
          src="/logo.png"
          className="mr-3 h-6 sm:h-9"
          alt="Logo"
        />
        <span className="self-center whitespace-nowrap text-xl font-semibold dark:text-white">
          My App
        </span>
      </Navbar.Brand>
      <Navbar.Toggle />
      <Navbar.Collapse>
        <Navbar.Link href="/" active={true}>
          Home
        </Navbar.Link>
        <Navbar.Link href="/about">About</Navbar.Link>
        <Navbar.Link href="/services">Services</Navbar.Link>
        <Navbar.Link href="/pricing">Pricing</Navbar.Link>
        <Navbar.Link href="/contact">Contact</Navbar.Link>
      </Navbar.Collapse>
    </Navbar>
  );
}
```

### Card

```jsx
import { Card } from 'flowbite-react';

export default function CardExample() {
  return (
    <Card className="max-w-sm">
      <h5 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
        Noteworthy technology acquisitions
      </h5>
      <p className="font-normal text-gray-700 dark:text-gray-400">
        Here are the biggest enterprise technology acquisitions of 2021 so far,
        in reverse chronological order.
      </p>
    </Card>
  );
}
```

### Form with validation

```jsx
import { Button, Label, TextInput } from 'flowbite-react';

export default function FormExample() {
  const handleSubmit = (e) => {
    e.preventDefault();
    // Handle form submission
  };

  return (
    <form className="flex max-w-md flex-col gap-4" onSubmit={handleSubmit}>
      <div>
        <div className="mb-2 block">
          <Label htmlFor="email" value="Your email" />
        </div>
        <TextInput
          id="email"
          type="email"
          placeholder="name@example.com"
          required
        />
      </div>
      <div>
        <div className="mb-2 block">
          <Label htmlFor="password" value="Your password" />
        </div>
        <TextInput id="password" type="password" required />
      </div>
      <Button type="submit">Submit</Button>
    </form>
  );
}
```

## Meteor.js starter project

The Flowbite community has created an open-source Meteor.js starter project that has Tailwind CSS and Flowbite React set up beforehand. You can clone it by checking out the [repository on GitHub](https://github.com/meteor/flowbite-meteor-starter).

## Further reading

- [Flowbite React Components](https://flowbite-react.com/)
- [Flowbite Documentation](https://flowbite.com/docs/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Flowbite React GitHub Repository](https://github.com/themesberg/flowbite-react)
