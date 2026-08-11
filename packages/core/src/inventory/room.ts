export interface Room {
  readonly id: string;

  readonly name: string;
  readonly description: string | null;

  readonly createdAt: Date;
  readonly updatedAt: Date;
}
