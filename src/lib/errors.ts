/** An error with an HTTP status whose message is safe to show the user. */
export class RoomError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
