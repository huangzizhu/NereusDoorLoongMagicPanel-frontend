import request from '../utils/request'
import type { ApiResponse } from '../types/user'
import type {
  DatabaseInstallInfo,
  DatabaseStatusInfo,
  DatabaseType,
  MySqlConnectionTestRequest,
  MySqlConnectionTestResult,
  MySqlCreateDatabaseRequest,
  MySqlCreateUserRequest,
} from '../types/database'
import type { MySqlCreateDatabaseResult, MySqlCreateUserResult, MySqlDatabasesResult } from '../types/database'

export function getDatabaseInstallInfo(databaseType: DatabaseType) {
  return request.get<ApiResponse<DatabaseInstallInfo>>(`/database/install/${databaseType}`)
}

export function getDatabaseStatus(databaseType: DatabaseType) {
  return request.get<ApiResponse<DatabaseStatusInfo>>(`/database/status/${databaseType}`)
}

export function testMySqlConnection(data: MySqlConnectionTestRequest) {
  return request.post<ApiResponse<MySqlConnectionTestResult>>('/database/mysql/test-connection', data)
}

export function getMySqlDatabases() {
  return request.get<ApiResponse<MySqlDatabasesResult>>('/database/mysql/databases')
}

export function createMySqlDatabase(data: MySqlCreateDatabaseRequest) {
  return request.post<ApiResponse<MySqlCreateDatabaseResult>>('/database/mysql/database', data)
}

export function createMySqlUser(data: MySqlCreateUserRequest) {
  return request.post<ApiResponse<MySqlCreateUserResult>>('/database/mysql/user', data)
}
