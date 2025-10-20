/**
 * This file contains tests for different Meteor skeletons.
 * It uses the testMeteorSkeleton function to test the creation, running, testing, and building
 * of different Meteor skeletons (apollo, react, etc.).
 */


import { testMeteorSkeleton } from "./test-helpers";
import { assertStyles } from "./assertions";

describe('Meteor Skeletons /', () => {
  describe('Apollo Skeleton /', testMeteorSkeleton({
    skeletonName: 'apollo',
    port: 3201,
    filePaths: { 
      client: 'client/main.jsx',
      server: 'server/main.js',
      test: 'tests/main.js'
    },
  }));

  describe('Babel Skeleton /', testMeteorSkeleton({
    skeletonName: 'babel',
    port: 3212,
    filePaths: {
      client: 'client/main.jsx',
      server: 'server/main.js',
      test: 'tests/main.js'
    },
  }));

  describe('Blaze Skeleton /', testMeteorSkeleton({
    skeletonName: 'blaze',
    port: 3202,
    filePaths: {
      client: 'client/main.js',
      server: 'server/main.js',
      test: 'tests/main.js',
    },
  }));

  describe('ChakraUI Skeleton /', testMeteorSkeleton({
    skeletonName: 'chakra-ui',
    port: 3203,
    filePaths: {
      client: 'client/main.jsx',
      server: 'server/main.js',
      test: 'tests/main.js',
    },
    checkBodyStyles: false,
  }));

  describe('Coffeescript Skeleton /', testMeteorSkeleton({
    skeletonName: 'coffeescript',
    port: 3211,
    filePaths: {
      client: 'client/main.coffee',
      server: 'server/main.coffee',
      test: 'tests/main.coffee',
    },
  }));

  describe('Full Skeleton /', testMeteorSkeleton({
    skeletonName: 'full',
    port: 3204,
    filePaths: {
      client: 'client/main.js',
      server: 'server/main.js',
      test: 'imports/api/links/methods.tests.js',
    },
  }));

  describe('React Skeleton /', testMeteorSkeleton({
    skeletonName: 'react',
    port: 3205,
    filePaths: {
      client: 'client/main.jsx',
      server: 'server/main.js',
      test: 'tests/main.js',
    },
  }));

  describe('Solid Skeleton /', testMeteorSkeleton({
    skeletonName: 'solid',
    port: 3206,
    filePaths: {
      client: 'client/main.js',
      server: 'server/main.js',
      test: 'tests/main.js',
    },
  }));

  describe('Svelte Skeleton /', testMeteorSkeleton({
    skeletonName: 'svelte',
    port: 3207,
    filePaths: {
      client: 'client/main.js',
      server: 'server/main.js',
      test: 'tests/main.js',
    },
  }));

  describe('Tailwind Skeleton /', testMeteorSkeleton({
    skeletonName: 'tailwind',
    port: 3208,
    filePaths: {
      client: 'client/main.tsx',
      server: 'server/main.ts',
      test: 'tests/main.ts',
    },
    customAssertions: {
      afterRun: async () => {
        // Verify Tailwind styles for ".bg-gray-100" element
        await assertStyles('.bg-gray-100', {
          ['background-color']: 'oklch(0.967 0.003 264.542)',
        });
      },
      afterRunProduction: async () => {
        // Verify Tailwind styles for ".bg-gray-100" element
        await assertStyles('.bg-gray-100', {
          ['background-color']: 'lab(96.1596 -0.0823438 -1.13575)',
        });
      }
    }
  }));

  describe('Typescript Skeleton /', testMeteorSkeleton({
    skeletonName: 'typescript',
    port: 3209,
    filePaths: {
      client: 'client/main.tsx',
      server: 'server/main.ts',
      test: 'tests/main.ts',
    },
  }));

  describe('Vue Skeleton /', testMeteorSkeleton({
    skeletonName: 'vue',
    port: 3210,
    filePaths: {
      client: 'client/main.js',
      server: 'server/main.js',
      test: 'tests/main.js',
    },
  }));
});
