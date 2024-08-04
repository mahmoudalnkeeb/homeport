import express, { NextFunction, Request, Response } from 'express';
import path from 'path';
import resourcesRouter from './routers/resources.router';
import { port } from './config/env.config';

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.urlencoded({ extended: true }));

app.use('/', resourcesRouter);

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).send('Something went wrong!');
});

app.listen(port, () => console.log(`Local downloader server running`));
