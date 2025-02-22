export interface ListBase<T> {
  success: boolean;
  msg: undefined | string;
  result: T[];
  totalCount: number;
  count: number;
  offset: number;
}

export interface ListBaseWithCursor<T> {
  success: boolean;
  msg: undefined | string;
  limit: number;
  totalCount: number;
  count: number;
  cursor: string;
  result: T[];
}

export interface SingleBase<T> {
  success: boolean;
  msg: undefined | string;
  result: T;
}
