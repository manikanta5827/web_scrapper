export function getISTDate(): Date {
  const date = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000; // 5 hours and 30 minutes in milliseconds
  return new Date(date.getTime() + istOffset);
}
