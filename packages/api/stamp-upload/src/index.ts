import { APIGatewayProxyHandlerV2, APIGatewayProxyEventV2 } from 'aws-lambda';
import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand, DeleteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { generateId } from '@comet/shared';

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-northeast-1' });
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const BUCKET_NAME = process.env.STAMP_BUCKET_NAME || '';
const TABLE_NAME = process.env.STAMPS_TABLE_NAME || '';
const CDN_DOMAIN = process.env.STAMP_CDN_DOMAIN || '';
const MAX_FILE_SIZE = 1024 * 1024; // 1MB
// イベント全文のログはデバッグ時のみ（CloudWatch Logsのコスト削減）
const DEBUG_LOGGING = process.env.LOG_LEVEL === 'debug';
// アップロード未完了のままのpendingレコードをTTLで自動削除するまでの時間
const PENDING_TTL_SECONDS = 24 * 60 * 60;

interface GeneratePresignedUrlRequest {
  fileName: string;
  fileType: string;
  fileSize: number;
  stampName?: string;
}

type ResponseHeaders = Record<string, string>;

/**
 * スタンプ一覧取得ハンドラー
 */
const handleListStamps = async () => {
  // 全件Scan+Filterだと件数増加でコスト・レイテンシが増えるため、
  // categoryのGSIに対するQueryで取得する
  // アップロード完了前のpendingレコードは一覧に出さない
  // （statusを持たない既存レコードはactive扱い）
  const result = await dynamoClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'CategoryIndex',
      KeyConditionExpression: 'category = :category',
      FilterExpression: 'attribute_not_exists(#st) OR #st = :active',
      ExpressionAttributeNames: { '#st': 'status' },
      ExpressionAttributeValues: {
        ':category': 'custom',
        ':active': 'active',
      },
    })
  );

  const stamps = (result.Items || []).map((item) => ({
    id: item.id,
    name: item.name,
    imageUrl: item.imageUrl,
    category: item.category,
  }));

  return stamps;
};

/**
 * スタンプ削除ハンドラー
 */
const handleDeleteStamp = async (stampId: string) => {
  // DynamoDBからスタンプ情報を取得
  const getResult = await dynamoClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { id: stampId },
    })
  );

  if (!getResult.Item) {
    return {
      statusCode: 404,
      error: 'Stamp not found',
    };
  }

  const stamp = getResult.Item;

  // S3から画像を削除
  if (stamp.s3Key) {
    try {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: BUCKET_NAME,
          Key: stamp.s3Key,
        })
      );
      console.log(`Deleted S3 object: ${stamp.s3Key}`);
    } catch (error) {
      console.error('Error deleting S3 object:', error);
      // S3削除失敗してもDynamoDB削除は続行
    }
  }

  // DynamoDBからスタンプを削除
  await dynamoClient.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { id: stampId },
    })
  );

  console.log(`Deleted stamp: ${stampId}`);

  return {
    statusCode: 200,
    success: true,
  };
};

/**
 * プリサインドURL生成ハンドラー
 */
const handleGeneratePresignedUrl = async (
  event: APIGatewayProxyEventV2,
  headers: ResponseHeaders
) => {
  if (!event.body) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Request body is required' }),
    };
  }

  const request: GeneratePresignedUrlRequest = JSON.parse(event.body);

  // バリデーション
  if (!request.fileName || !request.fileType || !request.fileSize) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'fileName, fileType, and fileSize are required' }),
    };
  }

  // ファイルサイズチェック
  if (request.fileSize > MAX_FILE_SIZE) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        error: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      }),
    };
  }

  // ファイルタイプチェック
  const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif'];
  if (!allowedTypes.includes(request.fileType)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        error: 'Invalid file type. Only PNG, JPG, and GIF are allowed',
      }),
    };
  }

  // ユニークなファイル名生成
  const stampId = generateId();
  const extension = request.fileType.split('/')[1];
  const s3Key = `custom/${stampId}.${extension}`;

  // プリサインドURL生成
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: s3Key,
    ContentType: request.fileType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 }); // 5分有効

  // スタンプメタデータをDynamoDBに保存
  const imageUrl = `https://${CDN_DOMAIN}/${s3Key}`;

  // スタンプ名（カスタム名があればそれを使用、なければファイル名から生成）
  const stampName = request.stampName?.trim() || request.fileName.replace(/\.[^/.]+$/, '');

  // アップロード完了確認（confirm）まではpendingとして保存する。
  // クライアントがアップロードを完了しないまま放置した場合はTTLで自動削除される
  await dynamoClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        id: stampId,
        name: stampName,
        imageUrl,
        category: 'custom',
        s3Key,
        uploadedAt: Date.now(),
        status: 'pending',
        ttl: Math.floor(Date.now() / 1000) + PENDING_TTL_SECONDS,
      },
    })
  );

  console.log(`Generated presigned URL for: ${s3Key}`);

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      uploadUrl,
      stampId,
      imageUrl,
      s3Key,
    }),
  };
};

/**
 * アップロード完了確認ハンドラー
 * S3に実際にオブジェクトが存在することを確認してからスタンプを有効化する
 */
const handleConfirmStamp = async (stampId: string) => {
  const getResult = await dynamoClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { id: stampId },
    })
  );

  if (!getResult.Item) {
    return { statusCode: 404, error: 'Stamp not found' };
  }

  const stamp = getResult.Item;

  // 既に有効化済みなら冪等に成功を返す
  if (stamp.status === 'active' || stamp.status === undefined) {
    return { statusCode: 200, success: true };
  }

  // S3に画像が実在するか確認する
  try {
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: stamp.s3Key,
      })
    );
  } catch (error) {
    console.warn(`Confirm rejected: object not found for ${stampId}`, error);
    return { statusCode: 400, error: 'Image has not been uploaded yet' };
  }

  // 有効化してTTLを外す
  await dynamoClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id: stampId },
      UpdateExpression: 'SET #st = :active REMOVE #ttl',
      ExpressionAttributeNames: { '#st': 'status', '#ttl': 'ttl' },
      ExpressionAttributeValues: { ':active': 'active' },
    })
  );

  console.log(`Confirmed stamp: ${stampId}`);
  return { statusCode: 200, success: true };
};

/**
 * メインハンドラー
 * API Gatewayに定義したルートと一致するrouteKeyで分岐する
 */
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  if (DEBUG_LOGGING) {
    console.log('Received event:', JSON.stringify(event));
  } else {
    console.log('Request:', event.routeKey);
  }

  // CORSヘッダー
  const headers: ResponseHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  };

  try {
    switch (event.routeKey) {
      // GET /stamps - スタンプ一覧取得
      case 'GET /stamps': {
        const stamps = await handleListStamps();
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ stamps }),
        };
      }

      // DELETE /stamps/{id} - スタンプ削除
      case 'DELETE /stamps/{id}': {
        const stampId = event.pathParameters?.id;
        if (!stampId) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Stamp ID is required' }),
          };
        }

        const result = await handleDeleteStamp(stampId);
        return {
          statusCode: result.statusCode,
          headers,
          body: JSON.stringify(result.error ? { error: result.error } : { success: true }),
        };
      }

      // POST /stamps/{id}/confirm - アップロード完了確認
      case 'POST /stamps/{id}/confirm': {
        const stampId = event.pathParameters?.id;
        if (!stampId) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Stamp ID is required' }),
          };
        }

        const result = await handleConfirmStamp(stampId);
        return {
          statusCode: result.statusCode,
          headers,
          body: JSON.stringify(
            result.error ? { error: result.error } : { success: true }
          ),
        };
      }

      // POST /upload - プリサインドURL生成
      case 'POST /upload': {
        return handleGeneratePresignedUrl(event, headers);
      }

      default:
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: `Route not found: ${event.routeKey}` }),
        };
    }
  } catch (error) {
    console.error('Error handling request:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to handle request',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
