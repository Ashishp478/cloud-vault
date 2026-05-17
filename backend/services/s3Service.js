


const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

console.log("Bucket:", process.env.S3_BUCKET_NAME);
console.log("Region:", process.env.AWS_REGION);
console.log("Access Key Exists:", !!process.env.AWS_ACCESS_KEY_ID);

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});


/**
 * Uploads a file buffer to S3
 * @param {string} key - The S3 object key (filename)
 * @param {Buffer} buffer - The file buffer
 * @param {string} mimetype - The MIME type of the file
 * @returns {Promise<any>}
 */
const uploadFileToS3 = async (key, buffer, mimetype) => {
  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: mimetype,
  });

  return await s3.send(command);
};

/**
 * Deletes a file from S3
 * @param {string} key - The S3 object key (filename)
 * @returns {Promise<any>}
 */
const deleteFileFromS3 = async (key) => {
  const command = new DeleteObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: key,
  });

  return await s3.send(command);
};

/**
 * Generates a pre-signed URL for downloading a file
 * @param {string} key - The S3 object key (filename)
 * @param {number} expiresIn - Expiration time in seconds
 * @returns {Promise<string>}
 */
const getPresignedUrl = async (key, expiresIn = 3600) => {
  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: key,
  });

  return await getSignedUrl(s3, command, { expiresIn });
};

module.exports = {
  s3,
  uploadFileToS3,
  deleteFileFromS3,
  getPresignedUrl,
};
