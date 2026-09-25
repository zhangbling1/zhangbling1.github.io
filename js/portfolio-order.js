/* Shared by the public book, editor and scanner. No persisted array-only ordering. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PortfolioOrder = factory();
})(typeof window === 'object' ? window : this, function () {
  'use strict';
  function compare(data) {
    const priority = new Map((data.siteInfo?.workOrder || []).map((id, index) => [id, index]));
    return (a, b) => (priority.get(a.id) ?? Infinity) - (priority.get(b.id) ?? Infinity)
      || (a.sortOrder || 0) - (b.sortOrder || 0);
  }
  function ordered(data, category) {
    const categories = new Map([...data.categories].sort((a, b) => a.order - b.order).map((cat, i) => [cat.id, i]));
    const byWork = compare(data);
    return data.items.filter(item => !category || item.category === category).sort((a, b) =>
      (categories.get(a.category) ?? Infinity) - (categories.get(b.category) ?? Infinity) || byWork(a, b));
  }
  function setCategory(data, category, ids) {
    const members = data.items.filter(item => item.category === category);
    if (ids.length !== members.length || new Set(ids).size !== ids.length || members.some(item => !ids.includes(item.id))) {
      throw new Error('排序必须包含分类内的全部作品');
    }
    // Consume the legacy opening priority for this category, keeping other chapters intact.
    const memberIds = new Set(ids);
    data.siteInfo ||= {};
    data.siteInfo.workOrder = (data.siteInfo.workOrder || []).filter(id => !memberIds.has(id));
    const positions = new Map(ids.map((id, index) => [id, index]));
    members.forEach(item => { item.sortOrder = positions.get(item.id); });
  }
  function move(data, category, selectedIds, position) {
    const items = ordered(data, category);
    const selected = new Set(selectedIds);
    const block = items.filter(item => selected.has(item.id));
    if (!block.length || block.length !== selected.size) throw new Error('请选择同一分类的作品');
    const rest = items.filter(item => !selected.has(item.id));
    const index = Math.max(0, Math.min(rest.length, Math.trunc(Number(position) || 1) - 1));
    rest.splice(index, 0, ...block);
    setCategory(data, category, rest.map(item => item.id));
    return index + 1;
  }
  function validate(data) {
    if (!data || !Array.isArray(data.items) || !Array.isArray(data.categories)
      || !data.profile || typeof data.profile !== 'object' || Array.isArray(data.profile)
      || !data.siteInfo || typeof data.siteInfo !== 'object' || Array.isArray(data.siteInfo)) {
      throw new Error('配置需要包含 items、categories、profile 和 siteInfo');
    }
    const ids = new Set();
    const categories = new Set();
    for (const cat of data.categories) {
      if (!cat || typeof cat.id !== 'string' || categories.has(cat.id)) throw new Error('分类 ID 无效或重复');
      categories.add(cat.id);
    }
    for (const item of data.items) {
      if (!item || typeof item.id !== 'string' || ids.has(item.id) || !categories.has(item.category)
        || typeof item.src !== 'string' || !/^(images|assets)\//.test(item.src) || item.src.split('/').includes('..')) {
        throw new Error('作品 ID、分类或素材路径无效，请检查导入配置');
      }
      ids.add(item.id);
      if (item.tags !== undefined && (!Array.isArray(item.tags) || item.tags.some(tag => typeof tag !== 'string'))) throw new Error('作品标签应为文字列表');
      if (item.visible !== undefined && typeof item.visible !== 'boolean') throw new Error('作品公开状态无效');
      if (item.sortOrder !== undefined && !Number.isFinite(item.sortOrder)) throw new Error('作品序号无效');
    }
    if (data.profile.experiences !== undefined && (!Array.isArray(data.profile.experiences)
      || data.profile.experiences.some(exp => !exp || typeof exp !== 'object' || Array.isArray(exp)))) throw new Error('工作经历格式无效');
    if (data.siteInfo.workOrder !== undefined && !Array.isArray(data.siteInfo.workOrder)) throw new Error('作品顺序格式无效');
    if (data.profile.skills !== undefined && (!Array.isArray(data.profile.skills) || data.profile.skills.some(skill => typeof skill !== 'string'))) throw new Error('技能应为文字列表');
    return data;
  }
  return { compare, ordered, setCategory, move, validate };
});
