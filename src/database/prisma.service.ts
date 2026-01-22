import { Injectable } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

@Injectable()
export class PrismaService extends PrismaClient {}