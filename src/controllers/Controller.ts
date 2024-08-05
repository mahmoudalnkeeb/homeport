import { NextFunction, Request, Response } from 'express';
import Service from '../services/Service';

export default class Controller {
  private readonly service: Service;
  constructor(service: Service = new Service()) {
    this.service = service;
  }

  getOne(req: Request, res: Response, next: NextFunction) {}
  getAll(req: Request, res: Response, next: NextFunction) {}
  getPage(req: Request, res: Response, next: NextFunction) {}
  create(req: Request, res: Response, next: NextFunction) {}
  updateById(req: Request, res: Response, next: NextFunction) {}
  deleteById(req: Request, res: Response, next: NextFunction) {}
}
