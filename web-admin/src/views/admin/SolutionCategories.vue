<template>
  <div class="page">
    <div class="page-card">
      <div class="page-header">
        <div>
          <h2 class="page-title">方案分类</h2>
          <p class="page-desc">对解决方案进行归类，便于客户在应用中心按分类浏览与选购</p>
        </div>
        <el-button type="primary" @click="openCreate">
          <el-icon style="margin-right: 4px"><Plus /></el-icon>新建分类
        </el-button>
      </div>

      <el-table :data="categories" v-loading="loading" style="width: 100%">
        <el-table-column prop="icon" label="图标" width="90">
          <template #default="{ row }">
            <div class="cat-icon"><SIcon :name="row.icon || 'palette'" size="default" /></div>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="分类名称" min-width="160" />
        <el-table-column prop="solutionCount" label="方案数" width="100">
          <template #default="{ row }"><span class="count-badge">{{ row.solutionCount }}</span></template>
        </el-table-column>
        <el-table-column prop="sortOrder" label="排序" width="90" />
        <el-table-column prop="enabled" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'info'" size="small">{{ row.enabled ? '启用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" align="right">
          <template #default="{ row }">
            <el-button size="small" text type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" text :type="row.enabled ? 'warning' : 'success'" @click="toggleStatus(row)">
              {{ row.enabled ? '停用' : '启用' }}
            </el-button>
            <el-button size="small" text type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 新建/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑分类' : '新建分类'" width="460px" class="app-dialog">
      <el-form :model="form" label-width="90px">
        <el-form-item label="分类名称" required>
          <el-input v-model="form.name" placeholder="如：名片营销" maxlength="20" show-word-limit />
        </el-form-item>
        <el-form-item label="图标">
          <div class="icon-picker">
            <div
              v-for="ic in iconOptions"
              :key="ic"
              class="icon-option"
              :class="{ active: form.icon === ic }"
              @click="form.icon = ic"
            >
              <SIcon :name="ic" size="large" />
            </div>
          </div>
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sortOrder" :min="0" :max="999" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="saving" @click="save">保存</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import SIcon from '../../components/SIcon.vue';
import { fetchSolutionCategories, createSolutionCategory, updateSolutionCategory, deleteSolutionCategory } from '../../api';

const iconOptions = ['palette', 'card', 'panorama', 'building', 'market', 'solutions', 'apps', 'badge'];

export default {
  components: { SIcon, Plus },
  setup() {
    const categories = ref([]);
    const loading = ref(false);
    const saving = ref(false);
    const dialogVisible = ref(false);
    const form = reactive({ id: null, name: '', icon: 'palette', sortOrder: 0 });

    const load = async () => {
      loading.value = true;
      try {
        categories.value = (await fetchSolutionCategories()).categories || [];
      } catch (e) {
        ElMessage.error(e);
      } finally {
        loading.value = false;
      }
    };

    const openCreate = () => {
      Object.assign(form, { id: null, name: '', icon: 'palette', sortOrder: 0 });
      dialogVisible.value = true;
    };

    const openEdit = (row) => {
      Object.assign(form, { id: row.id, name: row.name, icon: row.icon || 'palette', sortOrder: row.sortOrder });
      dialogVisible.value = true;
    };

    const save = async () => {
      if (!form.name.trim()) return ElMessage.warning('请输入分类名称');
      saving.value = true;
      try {
        if (form.id) {
          await updateSolutionCategory(form.id, { name: form.name, icon: form.icon, sortOrder: form.sortOrder });
          ElMessage.success('已保存');
        } else {
          await createSolutionCategory({ name: form.name, icon: form.icon, sortOrder: form.sortOrder });
          ElMessage.success('已创建');
        }
        dialogVisible.value = false;
        load();
      } catch (e) {
        ElMessage.error(e);
      } finally {
        saving.value = false;
      }
    };

    const toggleStatus = async (row) => {
      try {
        await updateSolutionCategory(row.id, { enabled: row.enabled ? 0 : 1 });
        row.enabled = !row.enabled;
        ElMessage.success(row.enabled ? '已启用' : '已停用');
      } catch (e) {
        ElMessage.error(e);
      }
    };

    const remove = async (row) => {
      try {
        await ElMessageBox.confirm(`确定删除分类「${row.name}」？`, '删除确认', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' });
      } catch {
        return;
      }
      try {
        await deleteSolutionCategory(row.id);
        ElMessage.success('已删除');
        load();
      } catch (e) {
        ElMessage.error(e);
      }
    };

    onMounted(load);
    return { categories, loading, saving, dialogVisible, form, iconOptions, openCreate, openEdit, save, toggleStatus, remove };
  },
};
</script>

<style scoped>
.page { padding: 20px; }
.page-card { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
.page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; }
.page-title { font-size: 18px; font-weight: 600; color: #1D2129; margin: 0; }
.page-desc { font-size: 13px; color: #86909C; margin: 6px 0 0; }
.cat-icon { width: 36px; height: 36px; border-radius: 8px; background: rgba(22,93,255,0.06); display: flex; align-items: center; justify-content: center; color: #4E5969; }
.count-badge { display: inline-block; padding: 2px 10px; background: #F2F3F5; border-radius: 10px; font-size: 12px; color: #4E5969; }
.icon-picker { display: flex; gap: 8px; flex-wrap: wrap; }
.icon-option { width: 40px; height: 40px; border-radius: 8px; border: 1px solid #E5E6EB; display: flex; align-items: center; justify-content: center; color: #4E5969; cursor: pointer; }
.icon-option:hover { border-color: #165DFF; color: #165DFF; }
.icon-option.active { border-color: #165DFF; background: #E8F3FF; color: #165DFF; }
.dialog-footer { display: flex; justify-content: flex-end; gap: 8px; }
</style>
