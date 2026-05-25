export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startLocationRoomWorkerAutostart } = await import('./lib/eliza/locationRooms/workerAutostart')
    startLocationRoomWorkerAutostart()
  }
}
