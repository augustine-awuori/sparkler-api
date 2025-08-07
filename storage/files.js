import dbConfig from "./config";

export const deleteImage = async (url) =>
  await dbConfig.deleteObject(dbConfig.ref(dbConfig.storage, url));

export const deleteImages = async (urls = []) => {
  const promises = urls.map(async (url) => await deleteImage(url));
  return Promise.all(promises);
};

export default { deleteImage, deleteImages };
