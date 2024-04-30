import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import {
  DLQTransformerRegistry,
  HookRegistry,
  TransformerRegistry,
} from "./types";

export type Action<T> = {
  type: string;
  payload: T;
};

export type DLQueueItem<T> = Action<T> & {
  payload?: Object;
  createdAt: string; // ISO string
  error: string;
};

export type Persistence<T> = {
  saveQueue: (actions: Action<T>[]) => Promise<void>;
  saveDLQueue: (actions: DLQueueItem<T>[]) => Promise<void>;
  readQueue: () => Promise<Action<T>[]>;
  readDLQueue: () => Promise<DLQueueItem<T>[]>;
};

type ErrorResolver = (err: Error) => boolean;

class Queue<T> {
  public items: T[];

  constructor(items: T[]) {
    this.items = items;
  }

  get head() {
    return this.items[0];
  }

  get size() {
    return this.items.length;
  }

  public enqueue(item: T) {
    this.items.push(item);
    return item;
  }

  public dequeue() {
    return this.items.shift();
  }
}

export class SwiftSync<T> {
  public queue: Queue<Action<T>>;
  public dlQueue: Queue<DLQueueItem<T>>;
  private isListening = false;
  private networkStatus = true;
  /**
   * queueStatus indicates whether current head is being processed
   */
  private queueStatus: "idle" | "processing" = "idle";
  private readonly hooksRegistry;
  private readonly transformerRegistry;
  private readonly dlqTransformerRegistry;
  private persistence;

  constructor(
    hooksRegistry: HookRegistry,
    transformerRegistry: TransformerRegistry,
    dlqTransformerRegistry: DLQTransformerRegistry,
    persistence: Persistence<T>,
  ) {
    this.queue = new Queue([]);
    this.dlQueue = new Queue([]);

    this.hooksRegistry = hooksRegistry;
    this.transformerRegistry = transformerRegistry;
    this.dlqTransformerRegistry = dlqTransformerRegistry;
    this.persistence = persistence;

    NetInfo.addEventListener((state: NetInfoState): void => {
      this.networkStatus = state.isConnected ?? false;

      if (state.isConnected) {
        this.listen();
      }
    });

    this.loadFromPersistenceAndListen(persistence);
  }

  get queueSize() {
    return this.queue.size;
  }

  public enqueue = (action: Action<T>) => {
    this.queue.enqueue(action);
    this.persistence.saveQueue(this.queue.items);
    this.listen();
  };

  public clearDLQ = () => {
    this.dlQueue.items = [];
    this.persistence.saveDLQueue(this.dlQueue.items);
  };

  private loadFromPersistenceAndListen = async (
    persistence: Persistence<T>,
  ) => {
    this.queue = new Queue(await persistence.readQueue());
    this.dlQueue = new Queue(await persistence.readDLQueue());
    this.listen();
  };

  private dequeue = () => {
    this.queue.dequeue();
    this.persistence.saveQueue(this.queue.items);
  };

  private enqueueDLQ = (action: Action<T>, error: Error) => {
    const { type, payload } = action;
    const transformedPayload = this.dlqTransformerRegistry[action.type]?.(
      payload,
    ) ?? { payload };
    const data: DLQueueItem<T> = {
      type,
      payload: transformedPayload?.payload,
      createdAt: new Date().toISOString(),
      error: JSON.stringify(error),
    };

    this.dlQueue.enqueue(data);
    this.persistence.saveDLQueue(this.dlQueue.items);
    // TODO: emit event {type: "DLQ", payload: data }
  };

  private async process(
    action: Action<T>,
    errorResolver: ErrorResolver = (err: Error) => true,
  ): Promise<void> {
    try {
      const { type, payload } = action;
      const { payload: transformedPayload, id } =
        this.transformerRegistry[type]?.(payload) ?? payload;
      await this.hooksRegistry[type]({ payload: transformedPayload, id });
    } catch (err) {
      if (errorResolver(err as Error)) {
        this.enqueueDLQ(action, err as Error);
        return;
      }
      throw err;
    }
  }

  private run = async () => {
    if (this.queueStatus === "processing") {
      return;
    }

    if (!this.queue.head) {
      return;
    }

    if (!this.networkStatus) {
      return;
    }

    this.queueStatus = "processing";

    try {
      await this.process(this.queue.head);
      this.dequeue();
    } catch (err) {
      throw err;
    } finally {
      this.queueStatus = "idle";
    }
  };

  private listen = async (callback?: (queueSize: number) => void) => {
    if (this.isListening) {
      return;
    }

    this.isListening = true;

    while (this.queue.head && this.networkStatus && this.isListening) {
      try {
        await this.run();
      } catch (err) {
        // If the queue errors and is blocked due to network / other uknown failures that are expected to be fixed, then
        // queue runner exits to be restarted by any of the following triggers:
        // - app is brought to foreground
        // - app is pushes to background
        // - network status is changed
        // - an entry is made in the queue
        // - notification is received
        // - background task is executed

        this.isListening = false;
        // TODO: emit event {type: "QUEUE_ERROR", payload: err }
      } finally {
        callback?.(this.queue.size);
      }
    }

    this.isListening = false;
  };
}
