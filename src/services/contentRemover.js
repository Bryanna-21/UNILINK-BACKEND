"use strict";

// Removes reported content when a moderator imposes "content_removal". Kept separate from the
// enforcement service so the service stays testable without a database.
//
// What gets removed is decided here, per type:
//   post / comment / discussion / note / past paper / library resource / event: the record is deleted
//   media / video: that ONE attachment is taken off its post
//   message: the text and file are blanked, so the conversation keeps its shape
//   profile / community: NOT removable this way (use a warning, restriction or suspension)
//
// Files on Cloudinary are deliberately NOT destroyed. The report holds a copy of what was reported
// (with the file address), and an appeal needs that evidence to still exist.

const Post = require("../models/Post");
const Comment = require("../models/Comment");
const Message = require("../models/Message");
const Discussion = require("../models/Discussion");
const Note = require("../models/Note");
const PastPaper = require("../models/PastPaper");
const DigitalResource = require("../models/DigitalResource");
const Event = require("../models/Event");

const DELETABLE = { comment: Comment, discussion: Discussion, note: Note, past_paper: PastPaper, library_resource: DigitalResource, event: Event };
const REMOVABLE = ["post", "message", "media", "video", ...Object.keys(DELETABLE)];

const canRemove = (entityType) => REMOVABLE.includes(entityType);

async function remove({ entityType, entityId, mediaRef }) {
  if (!canRemove(entityType)) throw new Error(`Cannot remove ${entityType}`);
  if (entityType === "post") {
    await Comment.deleteMany({ postId: entityId });
    await Post.deleteOne({ _id: entityId });
  } else if (entityType === "media" || entityType === "video") {
    if (!mediaRef) throw new Error("mediaRef required");
    await Post.updateOne({ _id: entityId }, { $pull: { media: { url: mediaRef } } });
  } else if (entityType === "message") {
    await Message.updateOne({ _id: entityId }, { $set: { text: "[removed by moderators]", fileUrl: null } });
  } else {
    await DELETABLE[entityType].deleteOne({ _id: entityId });
  }
  return { removed: true };
}

module.exports = { canRemove, remove };
