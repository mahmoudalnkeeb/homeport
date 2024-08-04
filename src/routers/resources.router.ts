import express, { Request, Response, Router } from 'express';
import path from 'path';

const filesRouter: Router = express.Router();

// temp
// filesRouter.get('/files/:folder/:file', (req: Request, res: Response) => {
//   const { folder, file } = req.params;
//   const root = process.cwd();
//   console.log(root, '|', folder, '|', file);
//   const requestedFile = path.join(root, 'data', folder, file);
//   res.sendFile(requestedFile);
// });

export default filesRouter;
