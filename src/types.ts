type TransformedPayload = {
  // internal id of the entity
  id: string;
  // transformed payload
  payload: any;
};

export type TransformerFn = (
  payload: any,
  throwExceptionOnMiss?: boolean,
) => { id: string; payload: any };
export type TransformerRegistry = Record<string, TransformerFn>;

export type WithEntities<T> = T & { entities: Record<string, any> };
export type DLQTransformerFn = (
  payload: any,
) => WithEntities<TransformedPayload>;
export type DLQTransformerRegistry = Record<string, DLQTransformerFn>;

type HookFn = (payload: TransformedPayload) => Promise<void>;
export type HookRegistry = Record<string, HookFn>;
