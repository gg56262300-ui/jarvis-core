export interface Repository<TItem, TCreateInput = Partial<TItem>> {
  list(): TItem[];
  create(input: TCreateInput): TItem;
}

