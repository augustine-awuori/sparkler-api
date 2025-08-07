import db from "./db";

export const deleteImage = async (url) =>
  await db.deleteObject(db.ref(db.storage, url));

export const deleteImages = async (urls = []) => {
  const promises = urls.map(async (url) => await deleteImage(url));
  return Promise.all(promises);
};

export default { deleteImage, deleteImages };
