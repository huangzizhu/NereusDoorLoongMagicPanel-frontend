<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import * as databaseApi from '../api/database'
import DockerStatusCard from '../components/docker/DockerStatusCard.vue'
import { useNotification } from '../composables/useNotification'
import type {
  DatabaseInstallInfo,
  DatabaseStatusInfo,
  DatabaseType,
  MySqlConnectionTestResult,
} from '../types/database'
import type {
  MySqlCreateDatabaseResult,
  MySqlCreateUserResult,
  MySqlDatabasesResult,
} from '../types/database'
import { DATABASE_TYPES } from '../types/database'

const notify = useNotification()

type DatabaseDetailTab = 'overview' | 'connection' | 'databases' | 'users'

interface DatabaseMeta {
  type: DatabaseType
  label: string
  subtitle: string
  defaultPort: number
  accentClass: string
  capabilityText: string
  icon: string
}

const DATABASE_META: Record<DatabaseType, DatabaseMeta> = {
  mysql: {
    type: 'mysql',
    label: 'MySQL',
    subtitle: '关系型数据库，当前接口支持安装检测、运行态检测与连接测试。',
    defaultPort: 3306,
    accentClass: 'mysql',
    capabilityText: '支持安装信息、运行状态和连接测试。',
    icon: '<svg fill="#4479A1" role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>MySQL</title><path d="M16.405 5.501c-.115 0-.193.014-.274.033v.013h.014c.054.104.146.18.214.273.054.107.1.214.154.32l.014-.015c.094-.066.14-.172.14-.333-.04-.047-.046-.094-.08-.14-.04-.067-.126-.1-.18-.153zM5.77 18.695h-.927a50.854 50.854 0 00-.27-4.41h-.008l-1.41 4.41H2.45l-1.4-4.41h-.01a72.892 72.892 0 00-.195 4.41H0c.055-1.966.192-3.81.41-5.53h1.15l1.335 4.064h.008l1.347-4.064h1.095c.242 2.015.384 3.86.428 5.53zm4.017-4.08c-.378 2.045-.876 3.533-1.492 4.46-.482.716-1.01 1.073-1.583 1.073-.153 0-.34-.046-.566-.138v-.494c.11.017.24.026.386.026.268 0 .483-.075.647-.222.197-.18.295-.382.295-.605 0-.155-.077-.47-.23-.944L6.23 14.615h.91l.727 2.36c.164.536.233.91.205 1.123.4-1.064.678-2.227.835-3.483zm12.325 4.08h-2.63v-5.53h.885v4.85h1.745zm-3.32.135l-1.016-.5c.09-.076.177-.158.255-.25.433-.506.648-1.258.648-2.253 0-1.83-.718-2.746-2.155-2.746-.704 0-1.254.232-1.65.697-.43.508-.646 1.256-.646 2.245 0 .972.19 1.686.574 2.14.35.41.877.615 1.583.615.264 0 .506-.033.725-.098l1.325.772.36-.622zM15.5 17.588c-.225-.36-.337-.94-.337-1.736 0-1.393.424-2.09 1.27-2.09.443 0 .77.167.977.5.224.362.336.936.336 1.723 0 1.404-.424 2.108-1.27 2.108-.445 0-.77-.167-.978-.5zm-1.658-.425c0 .47-.172.856-.516 1.156-.344.3-.803.45-1.384.45-.543 0-1.064-.172-1.573-.515l.237-.476c.438.22.833.328 1.19.328.332 0 .593-.073.783-.22a.754.754 0 00.3-.615c0-.33-.23-.61-.648-.845-.388-.213-1.163-.657-1.163-.657-.422-.307-.632-.636-.632-1.177 0-.45.157-.81.47-1.085.315-.278.72-.415 1.22-.415.512 0 .98.136 1.4.41l-.213.476a2.726 2.726 0 00-1.064-.23c-.283 0-.502.068-.654.206a.685.685 0 00-.248.524c0 .328.234.61.666.85.393.215 1.187.67 1.187.67.433.305.648.63.648 1.168zm9.382-5.852c-.535-.014-.95.04-1.297.188-.1.04-.26.04-.274.167.055.053.063.14.11.214.08.134.218.313.346.407.14.11.28.216.427.31.26.16.555.255.81.416.145.094.293.213.44.313.073.05.12.14.214.172v-.02c-.046-.06-.06-.147-.105-.214-.067-.067-.134-.127-.2-.193a3.223 3.223 0 00-.695-.675c-.214-.146-.682-.35-.77-.595l-.013-.014c.146-.013.32-.066.46-.106.227-.06.435-.047.67-.106.106-.027.213-.06.32-.094v-.06c-.12-.12-.21-.283-.334-.395a8.867 8.867 0 00-1.104-.823c-.21-.134-.476-.22-.697-.334-.08-.04-.214-.06-.26-.127-.12-.146-.19-.34-.275-.514a17.69 17.69 0 01-.547-1.163c-.12-.262-.193-.523-.34-.763-.69-1.137-1.437-1.826-2.586-2.5-.247-.14-.543-.2-.856-.274-.167-.008-.334-.02-.5-.027-.11-.047-.216-.174-.31-.235-.38-.24-1.364-.76-1.644-.072-.18.434.267.862.422 1.082.115.153.26.328.34.5.047.116.06.235.107.356.106.294.207.622.347.897.073.14.153.287.247.413.054.073.146.107.167.227-.094.136-.1.334-.154.5-.24.757-.146 1.693.194 2.25.107.166.362.534.703.393.3-.12.234-.5.32-.835.02-.08.007-.133.048-.187v.015c.094.188.188.367.274.555.206.328.566.668.867.895.16.12.287.328.487.402v-.02h-.015c-.043-.058-.1-.086-.154-.133a3.445 3.445 0 01-.35-.4 8.76 8.76 0 01-.747-1.218c-.11-.21-.202-.436-.29-.643-.04-.08-.04-.2-.107-.24-.1.146-.247.273-.32.453-.127.288-.14.642-.188 1.01-.027.007-.014 0-.027.014-.214-.052-.287-.274-.367-.46-.2-.475-.233-1.238-.06-1.785.047-.14.247-.582.167-.716-.042-.127-.174-.2-.247-.303a2.478 2.478 0 01-.24-.427c-.16-.374-.24-.788-.414-1.162-.08-.173-.22-.354-.334-.513-.127-.18-.267-.307-.368-.52-.033-.073-.08-.194-.027-.274.014-.054.042-.075.094-.09.088-.072.335.022.422.062.247.1.455.194.662.334.094.066.195.193.315.226h.14c.214.047.455.014.655.073.355.114.675.28.962.46a5.953 5.953 0 012.085 2.286c.08.154.115.295.188.455.14.33.313.663.455.982.14.315.275.636.476.897.1.14.502.213.682.286.133.06.34.115.46.188.23.14.454.3.67.454.11.076.443.243.463.378z"/></svg>',
  },
  mariadb: {
    type: 'mariadb',
    label: 'MariaDB',
    subtitle: 'MySQL 分支，当前接口提供安装检测与服务运行状态。',
    defaultPort: 3306,
    accentClass: 'mariadb',
    capabilityText: '支持安装信息与运行状态。',
    icon: '<svg fill="#003545" role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>MariaDB</title><path d="M23.157 4.412c-.676.284-.79.31-1.673.372-.65.045-.757.057-1.212.209-.75.246-1.395.75-2.02 1.59-.296.398-1.249 1.913-1.249 1.988 0 .057-.65.998-.915 1.32-.574.713-1.08 1.079-2.14 1.59-.77.36-1.224.524-4.102 1.477-1.073.353-2.133.738-2.367.864-.852.449-1.515 1.036-2.203 1.938-1.003 1.32-.972 1.313-3.042.947a12.264 12.264 0 00-.675-.063c-.644-.05-1.023.044-1.332.334L0 17.193l.177.088c.094.05.353.234.561.398.215.17.461.347.55.391.088.044.17.088.183.101.012.013-.089.17-.228.353-.435.581-.593.871-.574 1.048.019.164.032.17.43.17.517-.006.826-.056 1.261-.208.65-.233 2.058-.94 2.784-1.4.776-.5 1.717-.998 1.956-1.042.082-.02.354-.07.594-.114.58-.107 1.464-.095 2.587.05.108.013.373.045.6.064.227.025.43.057.454.076.026.012.474.037.998.056.934.026 1.104.007 1.3-.189.126-.133.385-.631.498-.985.209-.643.417-.921.366-.492-.113.966-.322 1.692-.713 2.411-.259.499-.663 1.092-.934 1.395-.322.347-.315.36.088.315.619-.063 1.471-.397 2.096-.82.827-.562 1.647-1.691 2.19-3.03.107-.27.22-.22.183.083-.013.094-.038.315-.057.498l-.031.328.353-.202c.833-.48 1.414-1.262 2.127-2.884.227-.518.877-2.922 1.073-3.976a9.64 9.64 0 01.271-1.042c.127-.429.196-.555.48-.858.183-.19.625-.555.978-.808.72-.505.953-.75 1.187-1.205.208-.417.284-1.13.132-1.357-.132-.202-.284-.196-.763.006Z"/></svg>',
  },
  postgresql: {
    type: 'postgresql',
    label: 'PostgreSQL',
    subtitle: '对象关系型数据库，当前接口提供安装检测与运行状态观测。',
    defaultPort: 5432,
    accentClass: 'postgresql',
    capabilityText: '支持安装信息与运行状态。',
    icon: '<svg fill="#4169E1" role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>PostgreSQL</title><path d="M23.5594 14.7228a.5269.5269 0 0 0-.0563-.1191c-.139-.2632-.4768-.3418-1.0074-.2321-1.6533.3411-2.2935.1312-2.5256-.0191 1.342-2.0482 2.445-4.522 3.0411-6.8297.2714-1.0507.7982-3.5237.1222-4.7316a1.5641 1.5641 0 0 0-.1509-.235C21.6931.9086 19.8007.0248 17.5099.0005c-1.4947-.0158-2.7705.3461-3.1161.4794a9.449 9.449 0 0 0-.5159-.0816 8.044 8.044 0 0 0-1.3114-.1278c-1.1822-.0184-2.2038.2642-3.0498.8406-.8573-.3211-4.7888-1.645-7.2219.0788C.9359 2.1526.3086 3.8733.4302 6.3043c.0409.818.5069 3.334 1.2423 5.7436.4598 1.5065.9387 2.7019 1.4334 3.582.553.9942 1.1259 1.5933 1.7143 1.7895.4474.1491 1.1327.1441 1.8581-.7279.8012-.9635 1.5903-1.8258 1.9446-2.2069.4351.2355.9064.3625 1.39.3772a.0569.0569 0 0 0 .0004.0041 11.0312 11.0312 0 0 0-.2472.3054c-.3389.4302-.4094.5197-1.5002.7443-.3102.064-1.1344.2339-1.1464.8115-.0025.1224.0329.2309.0919.3268.2269.4231.9216.6097 1.015.6331 1.3345.3335 2.5044.092 3.3714-.6787-.017 2.231.0775 4.4174.3454 5.0874.2212.5529.7618 1.9045 2.4692 1.9043.2505 0 .5263-.0291.8296-.0941 1.7819-.3821 2.5557-1.1696 2.855-2.9059.1503-.8707.4016-2.8753.5388-4.1012.0169-.0703.0357-.1207.057-.1362.0007-.0005.0697-.0471.4272.0307a.3673.3673 0 0 0 .0443.0068l.2539.0223.0149.001c.8468.0384 1.9114-.1426 2.5312-.4308.6438-.2988 1.8057-1.0323 1.5951-1.6698z"/></svg>',
  },
  redis: {
    type: 'redis',
    label: 'Redis',
    subtitle: '内存型键值数据库，当前接口提供安装检测与运行状态观测。',
    defaultPort: 6379,
    accentClass: 'redis',
    capabilityText: '支持安装信息与运行状态。',
    icon: '<svg fill="#FF4438" role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>Redis</title><path d="M22.71 13.145c-1.66 2.092-3.452 4.483-7.038 4.483-3.203 0-4.397-2.825-4.48-5.12.701 1.484 2.073 2.685 4.214 2.63 4.117-.133 6.94-3.852 6.94-7.239 0-4.05-3.022-6.972-8.268-6.972-3.752 0-8.4 1.428-11.455 3.685C2.59 6.937 3.885 9.958 4.35 9.626c2.648-1.904 4.748-3.13 6.784-3.744C8.12 9.244.886 17.05 0 18.425c.1 1.261 1.66 4.648 2.424 4.648.232 0 .431-.133.664-.365a100.49 100.49 0 0 0 5.54-6.765c.222 3.104 1.748 6.898 6.014 6.898 3.819 0 7.604-2.756 9.33-8.965.2-.764-.73-1.361-1.261-.73zm-4.349-5.013c0 1.959-1.926 2.922-3.685 2.922-.941 0-1.664-.247-2.235-.568 1.051-1.592 2.092-3.225 3.21-4.973 1.972.334 2.71 1.43 2.71 2.619z"/></svg>',
  },
  mongodb: {
    type: 'mongodb',
    label: 'MongoDB',
    subtitle: '文档型数据库，当前接口提供安装检测与运行状态观测。',
    defaultPort: 27017,
    accentClass: 'mongodb',
    capabilityText: '支持安装信息与运行状态。',
    icon: '<svg fill="#47A248" role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>MongoDB</title><path d="M17.193 9.555c-1.264-5.58-4.252-7.414-4.573-8.115-.28-.394-.53-.954-.735-1.44-.036.495-.055.685-.523 1.184-.723.566-4.438 3.682-4.74 10.02-.282 5.912 4.27 9.435 4.888 9.884l.07.05A73.49 73.49 0 0111.91 24h.481c.114-1.032.284-2.056.51-3.07.417-.296.604-.463.85-.693a11.342 11.342 0 003.639-8.464c.01-.814-.103-1.662-.197-2.218zm-5.336 8.195s0-8.291.275-8.29c.213 0 .49 10.695.49 10.695-.381-.045-.765-1.76-.765-2.405z"/></svg>',
  },
}

const loading = ref(true)
const refreshing = ref(false)
const activeType = ref<DatabaseType>('mysql')
const detailTab = ref<DatabaseDetailTab>('overview')
const lastUpdatedText = ref('尚未刷新')

const installMap = ref<Record<DatabaseType, DatabaseInstallInfo | null>>({
  mysql: null,
  mariadb: null,
  postgresql: null,
  redis: null,
  mongodb: null,
})

const statusMap = ref<Record<DatabaseType, DatabaseStatusInfo | null>>({
  mysql: null,
  mariadb: null,
  postgresql: null,
  redis: null,
  mongodb: null,
})

const mysqlForm = reactive({
  host: '127.0.0.1',
  port: 3306,
  username: 'root',
  password: '',
})

const mysqlTesting = ref(false)
const mysqlResult = ref<MySqlConnectionTestResult | null>(null)

/* ---------- MySQL 数据库管理 ---------- */
const mysqlDatabases = ref<MySqlDatabasesResult | null>(null)
const dbLoading = ref(false)

const createDbForm = reactive({
  dbName: '',
})
const dbCreating = ref(false)
const dbCreateResult = ref<MySqlCreateDatabaseResult | null>(null)

const createUserForm = reactive({
  dbName: '',
  username: '',
  password: '',
})
const userCreating = ref(false)
const userCreateResult = ref<MySqlCreateUserResult | null>(null)

let pollTimer: ReturnType<typeof setInterval> | null = null

const activeMeta = computed(() => DATABASE_META[activeType.value])
const activeInstall = computed(() => installMap.value[activeType.value])
const activeStatus = computed(() => statusMap.value[activeType.value])
const installedCount = computed(() => DATABASE_TYPES.filter((type) => installMap.value[type]?.isInstalled).length)
const runningCount = computed(() => DATABASE_TYPES.filter((type) => statusMap.value[type]?.isRunning).length)
const activeCanTestConnection = computed(() => activeType.value === 'mysql')
const activeConnectionCount = computed(() => activeStatus.value?.currentConnections ?? null)
const activeSlowQueryCount = computed(() => activeStatus.value?.slowQueryCount ?? null)

/* ---------- 标签页可见性 ---------- */
const tabs = computed(() => {
  const base: { id: DatabaseDetailTab; label: string; disabled: boolean; title?: string }[] = [
    { id: 'overview', label: '服务概览', disabled: false },
  ]
  if (activeType.value === 'mysql') {
    base.push({ id: 'connection', label: '连接测试', disabled: false })
    base.push({ id: 'databases', label: '数据库管理', disabled: false })
    base.push({ id: 'users', label: '用户管理', disabled: false })
  }
  return base
})

/* ---------- 校验工具 ---------- */
const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/

function validateIdentifier(val: string, name: string): string | null {
  if (!val.trim()) return `${name} 不能为空`
  if (!IDENTIFIER_RE.test(val.trim())) return `${name} 必须以字母或下划线开头，后续只能是字母、数字或下划线`
  return null
}

/* ---------- 数据库列表 ---------- */
async function loadMySqlDatabases() {
  if (activeType.value !== 'mysql') return
  dbLoading.value = true
  try {
    const res = await databaseApi.getMySqlDatabases()
    if (res.data.code === 1) {
      mysqlDatabases.value = res.data.data
    } else {
      notify.warning('获取数据库列表失败', res.data.msg)
    }
  } catch (error: any) {
    notify.error('获取数据库列表出错', error?.message || '请稍后重试')
  } finally {
    dbLoading.value = false
  }
}

/* ---------- 创建数据库 ---------- */
async function runCreateDatabase() {
  if (dbCreating.value) return

  const err = validateIdentifier(createDbForm.dbName, '数据库名')
  if (err) {
    notify.warning('参数错误', err)
    return
  }

  dbCreating.value = true
  dbCreateResult.value = null
  try {
    const res = await databaseApi.createMySqlDatabase({ dbName: createDbForm.dbName.trim() })
    if (res.data.code !== 1) {
      notify.warning('创建失败', res.data.msg)
      return
    }
    dbCreateResult.value = res.data.data
    notify.info('数据库创建成功', `${res.data.data.dbName} (${res.data.data.charset})`)
    createDbForm.dbName = ''
    await loadMySqlDatabases()
  } catch (error: any) {
    notify.error('创建数据库失败', error?.message || '请稍后重试')
  } finally {
    dbCreating.value = false
  }
}

/* ---------- 创建用户并授权 ---------- */
async function runCreateUser() {
  if (userCreating.value) return

  const err1 = validateIdentifier(createUserForm.dbName, '数据库名')
  if (err1) {
    notify.warning('参数错误', err1)
    return
  }
  const err2 = validateIdentifier(createUserForm.username, '用户名')
  if (err2) {
    notify.warning('参数错误', err2)
    return
  }
  if (!createUserForm.password) {
    notify.warning('参数错误', '密码不能为空')
    return
  }

  userCreating.value = true
  userCreateResult.value = null
  try {
    const res = await databaseApi.createMySqlUser({
      dbName: createUserForm.dbName.trim(),
      username: createUserForm.username.trim(),
      password: createUserForm.password,
    })
    if (res.data.code !== 1) {
      notify.warning('创建用户失败', res.data.msg)
      return
    }
    userCreateResult.value = res.data.data
    notify.info('用户创建成功', `${res.data.data.username}@${res.data.data.host} → ${res.data.data.dbName}`)
    createUserForm.dbName = ''
    createUserForm.username = ''
    createUserForm.password = ''
  } catch (error: any) {
    notify.error('创建用户失败', error?.message || '请稍后重试')
  } finally {
    userCreating.value = false
  }
}

function markUpdated() {
  const now = new Date()
  lastUpdatedText.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
}

function installTone(type: DatabaseType) {
  const info = installMap.value[type]
  if (!info) return 'default' as const
  return info.isInstalled ? 'success' as const : 'danger' as const
}

function runningTone(type: DatabaseType) {
  const info = statusMap.value[type]
  if (!info) return 'default' as const
  return info.isRunning ? 'success' as const : 'warning' as const
}

function installText(type: DatabaseType) {
  const info = installMap.value[type]
  if (!info) return '检测中'
  return info.isInstalled ? '已安装' : '未安装'
}

function statusText(type: DatabaseType) {
  const info = statusMap.value[type]
  if (!info) return '检测中'
  return info.isRunning ? '运行中' : '未运行'
}

function activeVersionText() {
  if (!activeInstall.value) return '--'
  return activeInstall.value.version || '未安装'
}

function activeStatusBadgeClass() {
  if (!activeStatus.value) return 'neutral'
  return activeStatus.value.isRunning ? 'online' : 'offline'
}

async function loadDatabaseType(type: DatabaseType) {
  const [installRes, statusRes] = await Promise.all([
    databaseApi.getDatabaseInstallInfo(type),
    databaseApi.getDatabaseStatus(type),
  ])

  if (installRes.data.code !== 1) {
    throw new Error(installRes.data.msg || `${DATABASE_META[type].label} 安装信息获取失败`)
  }

  if (statusRes.data.code !== 1) {
    throw new Error(statusRes.data.msg || `${DATABASE_META[type].label} 运行状态获取失败`)
  }

  installMap.value[type] = installRes.data.data
  statusMap.value[type] = statusRes.data.data
}

async function loadAllDatabases(showFullLoading = false) {
  try {
    if (showFullLoading) {
      loading.value = true
    } else {
      refreshing.value = true
    }

    await Promise.all(DATABASE_TYPES.map((type) => loadDatabaseType(type)))
    markUpdated()
  } catch (error: any) {
    notify.error('数据库状态加载失败', error?.message || '请稍后重试')
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

function switchDatabaseType(type: DatabaseType) {
  activeType.value = type
  detailTab.value = 'overview'
  if (type === 'mysql') {
    loadMySqlDatabases()
  }
}

async function runMySqlConnectionTest() {
  if (mysqlTesting.value) return

  if (!mysqlForm.host.trim()) {
    notify.warning('参数错误', '主机地址不能为空')
    return
  }

  if (!mysqlForm.username.trim()) {
    notify.warning('参数错误', '用户名不能为空')
    return
  }

  if (!mysqlForm.port || mysqlForm.port < 1 || mysqlForm.port > 65535) {
    notify.warning('参数错误', '端口号必须在 1-65535 之间')
    return
  }

  mysqlTesting.value = true
  mysqlResult.value = null
  try {
    const res = await databaseApi.testMySqlConnection({
      host: mysqlForm.host.trim(),
      port: Number(mysqlForm.port),
      username: mysqlForm.username.trim(),
      password: mysqlForm.password,
    })

    if (res.data.code !== 1) {
      notify.warning('MySQL 连接测试失败', res.data.msg)
      return
    }

    mysqlResult.value = res.data.data
    if (res.data.data.isConnectable) {
      notify.info('MySQL 连接测试成功', `${res.data.data.host}:${res.data.data.port}`)
    } else {
      notify.warning('MySQL 连接不可用', res.data.data.errorMessage || '请检查配置')
    }
  } catch (error: any) {
    notify.error('MySQL 连接测试失败', error?.message || '请稍后再试')
  } finally {
    mysqlTesting.value = false
  }
}

function startPolling() {
  stopPolling()
  pollTimer = setInterval(() => {
    loadAllDatabases()
  }, 15000)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

onMounted(async () => {
  await loadAllDatabases(true)
  loadMySqlDatabases()
  startPolling()
})

onUnmounted(() => {
  stopPolling()
})
</script>

<template>
  <div class="database-page">
    <header class="page-header">
      <div>
        <p class="eyebrow">Database Operations</p>
        <h1 class="page-title">数据库管理</h1>
        <p class="page-subtitle">围绕安装检测、运行状态和 MySQL 连接验证构建的多数据库工作台。</p>
      </div>

      <div class="header-actions">
        <div class="status-badge" :class="activeStatusBadgeClass()">
          <span class="dot"></span>
          {{ activeMeta.label }} {{ activeStatus?.isRunning ? '运行中' : '未运行' }}
        </div>
        <button class="secondary-btn" :disabled="refreshing" @click="loadAllDatabases()">
          {{ refreshing ? '刷新中...' : '刷新状态' }}
        </button>
      </div>
    </header>

    <section class="status-grid">
      <DockerStatusCard label="数据库类型" :value="DATABASE_TYPES.length" helper="当前接口支持 5 种数据库" />
      <DockerStatusCard label="已安装" :value="installedCount" tone="success" helper="完成安装检测的数据库实例" />
      <DockerStatusCard label="运行中" :value="runningCount" tone="info" helper="服务运行态来自 status 接口" />
      <DockerStatusCard label="当前数据库" :value="activeMeta.label" helper="点击下方类型卡片切换" />
      <DockerStatusCard label="当前版本" :value="activeVersionText()" helper="来自 install 接口返回值" />
      <DockerStatusCard label="最近刷新" :value="lastUpdatedText" helper="页面每 15 秒自动刷新" />
    </section>

    <div v-if="loading" class="skeleton-grid">
      <div v-for="i in 5" :key="i" class="skeleton-card"></div>
    </div>

    <template v-else>
      <section class="database-switcher">
        <button
          v-for="type in DATABASE_TYPES"
          :key="type"
          class="db-card"
          :class="[DATABASE_META[type].accentClass, { active: activeType === type }]"
          @click="switchDatabaseType(type)"
        >
          <div class="db-card-top">
            <span class="db-icon" v-html="DATABASE_META[type].icon"></span>
            <div class="db-badges">
              <span class="badge install" :class="installTone(type)">{{ installText(type) }}</span>
              <span class="badge runtime" :class="runningTone(type)">{{ statusText(type) }}</span>
            </div>
          </div>

          <div class="db-copy">
            <div class="db-name">{{ DATABASE_META[type].label }}</div>
            <div class="db-port">默认端口 {{ DATABASE_META[type].defaultPort }}</div>
          </div>
        </button>
      </section>

      <div class="detail-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="tab-btn"
          :class="{ active: detailTab === tab.id }"
          :disabled="tab.disabled"
          @click="detailTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>

      <section v-if="detailTab === 'overview'" class="overview-panel">
        <article class="panel-card hero-card">
          <div class="hero-main">
            <div class="hero-icon" :class="activeMeta.accentClass" v-html="activeMeta.icon"></div>
            <div class="hero-copy">
              <h2>{{ activeMeta.label }}</h2>
              <p>{{ activeMeta.subtitle }}</p>
            </div>
          </div>
          <div class="hero-meta">
            <div class="hero-stat">
              <span>安装状态</span>
              <strong>{{ activeInstall?.isInstalled ? '已安装' : '未安装' }}</strong>
            </div>
            <div class="hero-stat">
              <span>服务状态</span>
              <strong>{{ activeStatus?.isRunning ? '运行中' : '未运行' }}</strong>
            </div>
            <div class="hero-stat">
              <span>默认端口</span>
              <strong>{{ activeMeta.defaultPort }}</strong>
            </div>
          </div>
        </article>

        <section class="detail-grid single-panel">
          <article class="panel-card">
            <div class="panel-title">服务信号</div>
            <div class="signal-list">
              <div class="signal-row">
                <span>版本</span>
                <strong>{{ activeVersionText() }}</strong>
              </div>
              <div class="signal-row">
                <span>连接数</span>
                <strong>{{ activeConnectionCount === null ? 'N/A' : activeConnectionCount }}</strong>
              </div>
              <div class="signal-row">
                <span>慢查询数</span>
                <strong>{{ activeSlowQueryCount === null ? 'N/A' : activeSlowQueryCount }}</strong>
              </div>
              <div class="signal-row">
                <span>接口能力</span>
                <strong>{{ activeMeta.capabilityText }}</strong>
              </div>
            </div>
          </article>

        </section>
      </section>

      <!-- 连接测试 -->
      <section v-else-if="detailTab === 'connection'" class="connection-panel">
        <article class="panel-card connection-card">
          <div class="panel-head">
            <div>
              <h2>MySQL 连接测试</h2>
              <p>使用 `/database/mysql/test-connection` 对目标实例进行直连验证。</p>
            </div>
            <span class="pill">仅 MySQL 支持</span>
          </div>

          <div class="connection-form">
            <label class="field">
              <span>主机地址</span>
              <input v-model="mysqlForm.host" type="text" placeholder="127.0.0.1" />
            </label>
            <label class="field">
              <span>端口</span>
              <input v-model.number="mysqlForm.port" type="number" min="1" max="65535" />
            </label>
            <label class="field">
              <span>用户名</span>
              <input v-model="mysqlForm.username" type="text" placeholder="root" />
            </label>
            <label class="field">
              <span>密码</span>
              <input v-model="mysqlForm.password" type="password" placeholder="输入数据库密码" />
            </label>
          </div>

          <div class="form-actions">
            <button class="primary-btn" :disabled="mysqlTesting" @click="runMySqlConnectionTest">
              {{ mysqlTesting ? '测试中...' : '测试连接' }}
            </button>
          </div>

          <div v-if="mysqlResult" class="result-card" :class="{ success: mysqlResult.isConnectable, failure: !mysqlResult.isConnectable }">
            <div class="result-title">{{ mysqlResult.isConnectable ? '连接成功' : '连接失败' }}</div>
            <div class="result-meta">{{ mysqlResult.username }} @ {{ mysqlResult.host }}:{{ mysqlResult.port }}</div>
            <div v-if="mysqlResult.errorMessage" class="result-error">{{ mysqlResult.errorMessage }}</div>
          </div>
        </article>
      </section>

      <!-- 数据库管理 -->
      <section v-else-if="detailTab === 'databases'" class="connection-panel">
        <article class="panel-card">
          <div class="panel-head">
            <div>
              <h2>MySQL 数据库列表</h2>
              <p>使用 `GET /database/mysql/databases` 查看当前实例中的所有数据库。</p>
            </div>
            <button class="secondary-btn" :disabled="dbLoading" @click="loadMySqlDatabases">
              {{ dbLoading ? '加载中...' : '刷新列表' }}
            </button>
          </div>

          <div v-if="dbLoading" class="loading-hint">正在加载数据库列表…</div>
          <div v-else-if="!mysqlDatabases" class="loading-hint">尚未加载，点击上方「刷新列表」获取。</div>
          <div v-else-if="!mysqlDatabases.databases || mysqlDatabases.databases.length === 0" class="loading-hint">该实例中暂无用户数据库。</div>
          <div v-else class="db-table-wrap">
            <table class="db-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>数据库名</th>
                  <th>引擎</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(db, idx) in mysqlDatabases.databases" :key="db">
                  <td class="row-num">{{ idx + 1 }}</td>
                  <td>
                    <span class="db-name-cell">{{ db }}</span>
                    <span v-if="['information_schema', 'mysql', 'performance_schema', 'sys'].includes(db)" class="db-tag-system">系统库</span>
                  </td>
                  <td class="row-engine">InnoDB</td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>

        <article class="panel-card">
          <div class="panel-head">
            <div>
              <h2>创建数据库</h2>
              <p>使用 `POST /database/mysql/database` 创建一个新的 MySQL 数据库。</p>
            </div>
            <span class="pill">仅 MySQL 支持</span>
          </div>

          <div class="connection-form">
            <label class="field">
              <span>数据库名</span>
              <input v-model="createDbForm.dbName" type="text" placeholder="myapp" />
            </label>
          </div>
          <div class="form-hint">必须以字母或下划线开头，后续只能是字母、数字或下划线。</div>

          <div class="form-actions">
            <button class="primary-btn" :disabled="dbCreating" @click="runCreateDatabase">
              {{ dbCreating ? '创建中...' : '创建数据库' }}
            </button>
          </div>

          <div v-if="dbCreateResult" class="result-card success">
            <div class="result-title">创建成功</div>
            <div class="result-meta">{{ dbCreateResult.dbName }} · {{ dbCreateResult.charset }}{{ dbCreateResult.collation ? ' · ' + dbCreateResult.collation : '' }}</div>
          </div>
        </article>
      </section>

      <!-- 用户管理 -->
      <section v-else-if="detailTab === 'users'" class="connection-panel">
        <article class="panel-card">
          <div class="panel-head">
            <div>
              <h2>创建 MySQL 用户并授权</h2>
              <p>使用 `POST /database/mysql/user` 创建新用户并授予指定数据库的全部权限。</p>
            </div>
            <span class="pill">仅 MySQL 支持</span>
          </div>

          <div class="connection-form">
            <label class="field">
              <span>目标数据库</span>
              <input v-model="createUserForm.dbName" type="text" placeholder="myapp" />
            </label>
            <label class="field">
              <span>用户名</span>
              <input v-model="createUserForm.username" type="text" placeholder="myapp_user" />
            </label>
            <label class="field">
              <span>密码</span>
              <input v-model="createUserForm.password" type="password" placeholder="SecurePass123!" />
            </label>
          </div>
          <div class="form-hint">数据库名和用户名均须以字母或下划线开头，仅包含字母、数字、下划线。</div>

          <div class="form-actions">
            <button class="primary-btn" :disabled="userCreating" @click="runCreateUser">
              {{ userCreating ? '创建中...' : '创建用户并授权' }}
            </button>
          </div>

          <div v-if="userCreateResult" class="result-card success">
            <div class="result-title">用户创建成功</div>
            <div class="result-meta">{{ userCreateResult.username }}@{{ userCreateResult.host }}</div>
            <div class="result-meta">数据库: {{ userCreateResult.dbName }} · 权限: {{ userCreateResult.privileges }}</div>
          </div>
        </article>
      </section>
    </template>
  </div>
</template>

<style scoped>
.database-page {
  padding: 24px;
  max-width: 1680px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding: 22px;
  border: 1px solid var(--color-border);
  border-radius: 24px;
  background: var(--color-bg-surface);
  box-shadow: var(--shadow-sm);
}

.eyebrow {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-primary);
}

.page-title {
  margin-top: 6px;
  font-size: 30px;
  font-weight: 800;
  letter-spacing: -0.05em;
  color: var(--color-text);
  font-family: 'IBM Plex Sans', 'Segoe UI', sans-serif;
}

.page-subtitle {
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--color-text-secondary);
  max-width: 680px;
}

.header-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.status-badge.online {
  color: var(--color-success);
  background: var(--color-success-bg);
}

.status-badge.offline {
  color: var(--color-warning);
  background: var(--color-warning-bg);
}

.status-badge.neutral {
  color: var(--color-text-secondary);
  background: var(--color-bg-inset);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.status-grid,
.skeleton-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 14px;
}

.skeleton-card {
  min-height: 116px;
  border-radius: 18px;
  background: linear-gradient(90deg, var(--color-bg-surface), var(--color-bg-hover), var(--color-bg-surface));
  background-size: 240px 100%;
  animation: loading-shimmer 1.4s linear infinite;
}

.database-switcher {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 14px;
}

.db-card {
  border: 1px solid var(--color-border);
  border-radius: 22px;
  background: var(--color-bg-surface);
  box-shadow: var(--shadow-sm);
  padding: 18px;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
}

.db-card:hover {
  border-color: var(--color-primary);
  background: var(--color-bg-hover);
}

.db-card.active {
  border-color: var(--color-primary);
  background: var(--color-bg-active);
}

.db-card-top {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.db-icon {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
}

.db-icon :deep(svg) {
  width: 44px;
  height: 44px;
}

.db-badges {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-end;
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}

.badge.success {
  color: var(--color-success);
  background: var(--color-success-bg);
}

.badge.warning {
  color: var(--color-warning);
  background: var(--color-warning-bg);
}

.badge.danger {
  color: var(--color-danger);
  background: var(--color-danger-bg);
}

.badge.default {
  color: var(--color-text-secondary);
  background: var(--color-bg-inset);
}

.db-copy {
  margin-top: 18px;
}

.db-name {
  font-size: 18px;
  font-weight: 800;
  color: var(--color-text);
}

.db-port {
  margin-top: 8px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.detail-tabs {
  display: inline-flex;
  width: fit-content;
  gap: 4px;
  padding: 4px;
  border-radius: 16px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-surface);
}

.tab-btn {
  border: none;
  border-radius: 12px;
  padding: 10px 14px;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease, opacity 0.18s ease;
}

.tab-btn.active {
  background: var(--color-bg-inset);
  color: var(--color-text);
}

.tab-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.overview-panel,
.connection-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel-card {
  border: 1px solid var(--color-border);
  border-radius: 20px;
  background: var(--color-bg-surface);
  box-shadow: var(--shadow-sm);
  padding: 18px;
}

.hero-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
}

.hero-main {
  display: flex;
  align-items: center;
  gap: 18px;
}

.hero-icon {
  width: 64px;
  height: 64px;
  border-radius: 18px;
  background: var(--color-bg-inset);
  display: flex;
  align-items: center;
  justify-content: center;
}

.hero-icon :deep(svg) {
  width: 42px;
  height: 42px;
}

.hero-copy h2,
.panel-head h2 {
  font-size: 24px;
  font-weight: 800;
  color: var(--color-text);
}

.hero-copy p,
.panel-head p {
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--color-text-secondary);
  max-width: 720px;
}

.hero-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  min-width: 420px;
}

.hero-stat {
  border: 1px solid var(--color-border);
  border-radius: 16px;
  background: var(--color-bg-inset);
  padding: 14px;
}

.hero-stat span,
.panel-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
}

.hero-stat strong {
  display: block;
  margin-top: 8px;
  font-size: 18px;
  color: var(--color-text);
}

.detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
}

.detail-grid.single-panel {
  grid-template-columns: minmax(0, 1fr);
}

.signal-list,
.note-list {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.signal-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--color-bg-inset);
  border: 1px solid var(--color-border);
}

.signal-row span {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.signal-row strong {
  font-size: 13px;
  color: var(--color-text);
  text-align: right;
}

.note-item {
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--color-bg-inset);
  border: 1px solid var(--color-border);
  font-size: 13px;
  line-height: 1.7;
  color: var(--color-text-secondary);
}

.panel-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.pill {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 999px;
  background: var(--color-info-bg);
  color: var(--color-info);
  font-size: 12px;
  font-weight: 700;
}

.connection-form {
  margin-top: 18px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field span {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.field input {
  width: 100%;
  min-height: 44px;
  border-radius: 14px;
  border: 1px solid var(--color-border-solid);
  background: var(--color-bg);
  color: var(--color-text);
  padding: 0 14px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.field input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-ghost);
}

.form-actions {
  margin-top: 18px;
  display: flex;
  justify-content: flex-end;
}

.primary-btn,
.secondary-btn {
  min-height: 42px;
  border-radius: 12px;
  padding: 0 16px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease, opacity 0.18s ease;
}

.primary-btn {
  border: 1px solid var(--color-border-solid);
  color: var(--color-text);
  background: var(--color-bg-surface);
}

.primary-btn:hover {
  border-color: var(--color-primary);
  background: var(--color-bg-hover);
  color: var(--color-primary);
}

.secondary-btn {
  border: 1px solid var(--color-border-solid);
  color: var(--color-text-secondary);
  background: var(--color-bg-surface);
}

.secondary-btn:hover {
  color: var(--color-text);
  border-color: var(--color-primary);
  background: var(--color-bg-hover);
}

.primary-btn:disabled,
.secondary-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.result-card {
  margin-top: 18px;
  border: 1px solid var(--color-border);
  border-radius: 16px;
  padding: 16px;
  background: var(--color-bg-inset);
}

.result-card.success {
  border-color: rgba(16, 185, 129, 0.18);
}

.result-card.failure {
  border-color: rgba(239, 68, 68, 0.18);
}

.result-title {
  font-size: 16px;
  font-weight: 800;
  color: var(--color-text);
}

.result-meta {
  margin-top: 8px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.result-error {
  margin-top: 10px;
  font-size: 13px;
  color: var(--color-danger);
  line-height: 1.7;
}

@keyframes loading-shimmer {
  0% {
    background-position: -240px 0;
  }
  100% {
    background-position: 240px 0;
  }
}

/* ---------- 数据库管理 / 用户管理 新增样式 ---------- */
.loading-hint {
  margin-top: 14px;
  padding: 24px;
  text-align: center;
  border-radius: 14px;
  background: var(--color-bg-inset);
  font-size: 14px;
  color: var(--color-text-muted);
}

.form-hint {
  margin-top: 8px;
  font-size: 12px;
  color: var(--color-text-muted);
  line-height: 1.6;
}

.db-table-wrap {
  margin-top: 14px;
  overflow-x: auto;
}

.db-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.db-table th {
  text-align: left;
  padding: 10px 14px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  border-bottom: 1px solid var(--color-border);
}

.db-table td {
  padding: 12px 14px;
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text);
}

.db-table tbody tr:hover {
  background: var(--color-bg-hover);
}

.row-num {
  width: 40px;
  color: var(--color-text-muted);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.db-name-cell {
  font-weight: 700;
  font-family: 'IBM Plex Mono', 'Fira Code', monospace;
  font-size: 13px;
}

.row-engine {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.db-tag-system {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 6px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 700;
  color: var(--color-text-muted);
  background: var(--color-bg-inset);
  vertical-align: middle;
}

@media (max-width: 1280px) {
  .status-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .database-switcher {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .hero-card,
  .hero-main {
    flex-direction: column;
    align-items: flex-start;
  }

  .hero-meta,
  .detail-grid {
    min-width: 0;
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .database-page {
    padding: 16px;
  }

  .page-header,
  .panel-head {
    flex-direction: column;
  }

  .header-actions {
    width: 100%;
    align-items: stretch;
  }

  .status-grid,
  .database-switcher,
  .connection-form {
    grid-template-columns: 1fr;
  }

  .detail-tabs {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
}
</style>
