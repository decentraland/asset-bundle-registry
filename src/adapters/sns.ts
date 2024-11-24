// import { PublishBatchCommand, SNSClient } from '@aws-sdk/client-sns'
// import { AppComponents } from '../types'

// export type Message = {
//   Message: string
//   MessageAttributes: {
//     type: {
//       DataType: string
//       StringValue: string
//     }
//     subType: {
//       DataType: string
//       StringValue: string
//     }
//   }
// }

// function chunk<T>(theArray: T[], onSlices: number): T[][] {
//   return theArray.reduce((acc: T[][], _, i) => {
//     if (i % onSlices === 0) {
//       acc.push(theArray.slice(i, i + onSlices))
//     }
//     return acc
//   }, [])
// }

// export async function createSnsComponent({ config }: Pick<AppComponents, 'config'>): Promise<PublisherComponent> {
//   // SNS PublishBatch can handle up to 10 messages in a single request
//   const MAX_BATCH_SIZE = 10
//   const snsArn = await config.requireString('AWS_SNS_ARN')
//   const optionalEndpoint = await config.getString('AWS_SNS_ENDPOINT')

//   const client = new SNSClient({
//     endpoint: optionalEndpoint ? optionalEndpoint : undefined
//   })

//   async function publishMessage(messagesToPublish: Message[]): Promise<{
//     successfulMessageIds: string[]
//     failedMessages: string[]
//   }> {
//     // split messages into batches of 10 (SNS limitation)
//     const batches: Message[][] = chunk(messagesToPublish, MAX_BATCH_SIZE)

//     const publishPromises = batches.map(async (batch: Message[], batchIndex: number) => {
//       const entries: (Message & { Id: string })[] = batch.map((message: Message, index: number) => ({
//         ...message,
//         Id: `msg_${batchIndex * MAX_BATCH_SIZE + index}`
//       }))

//       const command = new PublishBatchCommand({
//         TopicArn: snsArn,
//         PublishBatchRequestEntries: entries
//       })

//       const { Successful, Failed } = await client.send(command)

//       const successfulMessageIds: string[] =
//         Successful?.map((result) => result.MessageId).filter(
//           (messageId: string | undefined) => messageId !== undefined
//         ) || []

//       const failedEvents =
//         Failed?.map((failure) => {
//           const failedEntry = entries.find((entry: any) => entry.Id === failure.Id)
//           const failedIndex = entries.indexOf(failedEntry!)
//           return batch[failedIndex]
//         }) || []

//       return { successfulMessageIds, failedEvents }
//     })
//   }
// }
