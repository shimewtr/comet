import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, ScanCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-northeast-1' });
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const BUCKET_NAME = process.env.STAMP_BUCKET_NAME || '';
const TABLE_NAME = process.env.STAMPS_TABLE_NAME || '';
const CDN_DOMAIN = process.env.STAMP_CDN_DOMAIN || '';
const MAX_FILE_SIZE = 1024 * 1024; // 1MB

interface GeneratePresignedUrlRequest {
  fileName: string;
  fileType: string;
  fileSize: number;
  stampName?: string;
}

/**
 * スタンプ一覧取得ハンドラー
 */
const handleListStamps = async () => {
  const result = await dynamoClient.send(
    new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'category = :category',
      ExpressionAttributeValues: {
        ':category': 'custom',
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
 * プリサインドURL生成 & スタンプ一覧取得ハンドラー
 */
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  console.log('Received event:', JSON.stringify(event));

  // CORSヘッダー
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  };

  // OPTIONSリクエスト（プリフライト）
  if (event.requestContext.http.method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  try {
    // GET /stamps - スタンプ一覧取得
    if (event.requestContext.http.method === 'GET' && event.rawPath.includes('/stamps')) {
      const stamps = await handleListStamps();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ stamps }),
      };
    }

    // DELETE /stamps/{id} - スタンプ削除
    if (event.requestContext.http.method === 'DELETE' && event.rawPath.includes('/stamps/')) {
      const stampId = event.rawPath.split('/stamps/')[1];
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

    // POST /upload - プリサインドURL生成
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
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 11);
    const extension = request.fileType.split('/')[1];
    const s3Key = `custom/${timestamp}-${randomString}.${extension}`;

    // プリサインドURL生成
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      ContentType: request.fileType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 }); // 5分有効

    // スタンプメタデータをDynamoDBに保存
    const stampId = `${timestamp}-${randomString}`;
    const imageUrl = `https://${CDN_DOMAIN}/${s3Key}`;

    // スタンプ名（カスタム名があればそれを使用、なければファイル名から生成）
    const stampName = request.stampName?.trim() || request.fileName.replace(/\.[^/.]+$/, '');

    await dynamoClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          id: stampId,
          name: stampName,
          imageUrl,
          category: 'custom',
          s3Key,
          uploadedAt: timestamp,
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
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to generate upload URL',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
