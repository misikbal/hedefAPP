import mongoose from 'mongoose';

mongoose.set('strictQuery', true);

export async function connectDb(uri: string): Promise<typeof mongoose> {
  return mongoose.connect(uri, { serverSelectionTimeoutMS: 5_000 });
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}

export function isDbUp(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}
