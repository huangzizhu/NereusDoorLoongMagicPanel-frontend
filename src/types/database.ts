export const DATABASE_TYPES = ['mysql', 'mariadb', 'postgresql', 'redis', 'mongodb'] as const

export type DatabaseType = typeof DATABASE_TYPES[number]

export interface DatabaseInstallInfo {
  isInstalled: boolean
  version: string | null
  databaseType: DatabaseType
}

export interface DatabaseStatusInfo {
  isRunning: boolean
  databaseType: DatabaseType
  currentConnections: number | null
  slowQueryCount: number | null
}

export interface MySqlConnectionTestRequest {
  host: string
  port: number
  username: string
  password: string
}

export interface MySqlConnectionTestResult {
  isConnectable: boolean
  host: string
  port: number
  username: string
  errorMessage?: string
}

/** POST /database/mysql/database 请求体 */
export interface MySqlCreateDatabaseRequest {
  dbName: string
}

/** POST /database/mysql/database 返回值 */
export interface MySqlCreateDatabaseResult {
  dbName: string
  charset: string
  collation?: string
  isCreated: boolean
}

/** POST /database/mysql/user 请求体 */
export interface MySqlCreateUserRequest {
  dbName: string
  username: string
  password: string
}

/** POST /database/mysql/user 返回值 */
export interface MySqlCreateUserResult {
  dbName: string
  username: string
  host: string
  privileges: string
  isGranted: boolean
  isCreated: boolean
}

/** GET /database/mysql/databases 返回值 */
export interface MySqlDatabasesResult {
  databaseType: string
  databases: string[] | null
}
