import ServerClass from "./server";
import SessionCollectionView from "./session_collection_view";
import SessionDocumentView from "./session_document_view";

DDPServer = {};

// This file links these classes:
// * Session - The server's connection to a single DDP client
// * Subscription - A single subscription for a single client
// * Server - An entire server that may talk to > 1 client. A DDP endpoint.
//

DDPServer._SessionDocumentView = SessionDocumentView;

DDPServer._SessionCollectionView = SessionCollectionView;


Server = new ServerClass();

var calculateVersion = function (clientSupportedVersions,
                                 serverSupportedVersions) {
  var correctVersion = clientSupportedVersions.find(function (version) {
    return serverSupportedVersions.includes(version);
  });
  if (!correctVersion) {
    correctVersion = serverSupportedVersions[0];
  }
  return correctVersion;
};

DDPServer._calculateVersion = calculateVersion;

