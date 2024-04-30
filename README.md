# SwiftSync

[![License](https://img.shields.io/badge/license-MIT-green.svg)](https://opensource.org/licenses/MIT)

## Description

SwiftSync is a TypeScript package for managing a queue of actions with support for handling intermittent network
connectivity. It provides a robust solution for ensuring that actions are processed reliably even in scenarios where
network connectivity is unstable.

## Installation

To install SwiftSync, you can use npm:

## Usage

### Create your initialization module and export the queue instance

```typescript
// init-module.ts

import { SwiftSync, Action, Persistence, HookRegistry, TransformerRegistry, DLQTransformerRegistry } from 'swift-sync';

// Define your persistence implementation
const persistence: Persistence<T> = {
  saveQueue: async (actions: Action<T>[]) => {
    // Your implementation to save the queue to persistent storage
  },
  saveDLQueue: async (actions: DLQueueItem<T>[]) => {
    // Your implementation to save the DLQ to persistent storage
  },
  readQueue: async () => {
    // Your implementation to read the queue from persistent storage
    return [];
  },
  readDLQueue: async () => {
    // Your implementation to read the DLQ from persistent storage
    return [];
  }
};

// Define your hook registry
const hooksRegistry: HookRegistry = {
  actionName: (action: Action<T>) => {
    // Your implementation to handle the action
  },
};

// Define your transformer registry
const transformerRegistry: TransformerRegistry = {
  actionName: (action: Action<T>) => {
    // Your implementation to transform the payload
  },
};

let queueInstance: PatchyInternetQImpl;

export const init = (
  hooksRegistry: HookRegistry,
  transformerRegistry: TransformerRegistry,
  dlqTransformerRegistry: DLQTransformerRegistry,
  persistence: Persistence,
): PatchyInternetQImpl => {
  if (queueInstance) {
    return queueInstance;
  }

  queueInstance = new PatchyInternetQImpl(
    hooksRegistry,
    transformerRegistry,
    dlqTransformerRegistry,
    persistence,
  );

  return queueInstance;
};

const getQueue = () => queueInstance;
export default getQueue;
```

### Use the queue instance in your application

```typescript
// app.ts

import sw from './init-module';

sw().enqueue({
  type: 'ACTION_NAME',
  payload: {
    // Your payload
  },
});
```

