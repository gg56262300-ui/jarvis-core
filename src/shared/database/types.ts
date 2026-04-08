export type SqliteValue = string | number | bigint | Buffer | null;

export interface PreparedStatement<
  TParams extends Record<string, SqliteValue> = Record<string, SqliteValue>,
  TResult = unknown,
> {
  all(params?: TParams): TResult[];
  get(params?: TParams): TResult | undefined;
  run(params?: TParams): {
    changes: number;
    lastInsertRowid: number | bigint;
  };
}

export interface DatabaseProvider {
  initialize(): void;
  prepare<TParams extends Record<string, SqliteValue> = Record<string, SqliteValue>, TResult = unknown>(
    sql: string,
  ): PreparedStatement<TParams, TResult>;
}
