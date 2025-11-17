<template>
  <div class="home-container" @click="handleContainerClick">
    <div class="menu-bar-fixed">
      <MenuBar 
        :menus="menus" 
        :activeId="activeMenu?.id" 
        :activeSubMenuId="activeSubMenu?.id"
        @select="selectMenu"
      />
    </div>
    
    <div class="search-section">
<div class="search-box-wrapper" v-if="selectedEngine">
        <div class="search-container">
          <!-- 搜索引擎下拉选择器 -->
          <div class="search-engine-dropdown" @click.stop>
            <button @click="toggleEngineDropdown" class="engine-selector" title="选择搜索引擎">
              <span class="engine-icon">
                <img 
                  :src="getEngineIcon(selectedEngine)" 
                  :alt="selectedEngine.label"
                  @error="handleEngineIconError"
                  class="engine-icon-img"
                />
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
            <!-- 下拉菜单 -->
            <transition name="dropdown">
              <div v-if="showEngineDropdown" class="engine-dropdown-menu" @click.stop>
                <div class="engine-menu-header">
                  <span>搜索引擎</span>
                  <button @click="openAddEngineModal" class="add-engine-icon-btn" title="添加自定义">
                    +
                  </button>
                </div>
                <div class="engine-menu-items">
                  <button v-for="engine in searchEngines" :key="engine.name"
                    :class="['engine-menu-item', {active: selectedEngine.name === engine.name}]"
                    @click="selectEngineFromDropdown(engine)"
                  >
                    <span class="engine-icon">
                      <img
                        :src="getEngineIcon(engine)" 
                        :alt="engine.label"
                        @error="handleEngineIconError"
                        class="engine-icon-img"
                      />
                    </span>
                    <span class="engine-label">{{ engine.label }}</span>
                    <button v-if="engine.custom" @click.stop="deleteCustomEngine(engine)" class="delete-engine-btn-small" title="删除">
                      ×
                    </button>
                  </button>
                </div>
              </div>
            </transition>
          </div>
<input 
            v-model="searchQuery" 
            type="text" 
            :placeholder="selectedEngine ? selectedEngine.placeholder : '搜索...'" 
            class="search-input"
            @keyup.enter="handleSearch"
          />
          <button v-if="searchQuery" class="clear-btn" @click="clearSearch" aria-label="清空" title="clear">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"></path></svg>
          </button>
          <button @click="handleSearch" class="search-btn" title="search">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
    
    <!-- 迷你标签栏 -->
    <div v-if="allTags.length > 0" class="mini-tag-bar">
      <!-- 已选标签显示 -->
      <div class="selected-tag-display" v-if="selectedTagId">
        <span class="mini-tag-chip" :style="{ backgroundColor: getTagById(selectedTagId)?.color }">
          {{ getTagById(selectedTagId)?.name }}
          <button class="mini-tag-close" @click="clearTagFilter" title="清除筛选">×</button>
        </span>
      </div>
      <!-- 标签选择按钮 -->
      <button class="mini-tag-btn" @click="showTagPanel = !showTagPanel" :title="showTagPanel ? '关闭标签' : '选择标签'">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
          <line x1="7" y1="7" x2="7.01" y2="7"/>
        </svg>
        <span class="tag-count">{{ allTags.length }}</span>
      </button>
    </div>
    
    <!-- 标签选择浮层 -->
    <transition name="tag-panel">
      <div v-if="showTagPanel" class="tag-panel-overlay" @click="showTagPanel = false">
        <div class="tag-panel" @click.stop>
          <div class="tag-panel-header">
            <h4>选择标签</h4>
            <button class="panel-close-btn" @click="showTagPanel = false">×</button>
          </div>
          <div class="tag-panel-content">
            <button 
              v-for="tag in allTags" 
              :key="tag.id" 
              class="panel-tag-btn"
              :class="{ active: selectedTagId === tag.id }"
              :style="{ 
                backgroundColor: selectedTagId === tag.id ? tag.color : 'rgba(255,255,255,0.9)',
                color: selectedTagId === tag.id ? 'white' : tag.color,
                borderColor: tag.color
              }"
              @click="selectTag(tag.id)"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                <line x1="7" y1="7" x2="7.01" y2="7"/>
              </svg>
              {{ tag.name }}
            </button>
          </div>
        </div>
      </div>
    </transition>
    
    <!-- 左侧广告条 -->
    <div v-if="leftAds.length" class="ad-space-fixed left-ad-fixed">
      <a v-for="ad in leftAds" :key="ad.id" :href="ad.url" target="_blank">
        <img :src="ad.img" alt="广告" loading="lazy" />
      </a>
    </div>
    <!-- 右侧广告条 -->
    <div v-if="rightAds.length" class="ad-space-fixed right-ad-fixed">
      <a v-for="ad in rightAds" :key="ad.id" :href="ad.url" target="_blank">
        <img :src="ad.img" alt="广告" loading="lazy" />
      </a>
    </div>
    
    
    <!-- 编辑模式目标分类选择面板 -->
    <div v-if="editMode && showMovePanel" class="move-target-panel">
      <div class="move-target-header">
        <h4>移动到 ({{ selectedCards.length }})</h4>
        <button @click="cancelMove" class="cancel-move-btn">×</button>
      </div>
      <div class="move-target-list">
        <div v-for="menu in menus" :key="menu.id" class="target-menu-group">
          <button 
            @click="moveCardToCategory(menu.id, null)" 
            class="target-menu-btn"
            :class="{ 'active': targetMenuId === menu.id && targetSubMenuId === null }"
          >
            {{ menu.name }}
          </button>
          <div v-if="menu.subMenus && menu.subMenus.length" class="target-submenu-list">
            <button 
              v-for="subMenu in menu.subMenus" 
              :key="subMenu.id"
              @click="moveCardToCategory(menu.id, subMenu.id)" 
              class="target-submenu-btn"
              :class="{ 'active': targetMenuId === menu.id && targetSubMenuId === subMenu.id }"
            >
              ? {{ subMenu.name }}
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 始终显示当前选中的分类 -->
    <CardGrid 
      :cards="filteredCards" 
      :editMode="editMode"
      :selectedCards="selectedCards"
      :categoryId="activeMenu?.id"
      :subCategoryId="activeSubMenu?.id"
      @cardsReordered="handleCardsReordered"
      @editCard="handleEditCard"
      @deleteCard="handleDeleteCard"
      @toggleCardSelection="toggleCardSelection"
      @click.stop
    />
    
    <!-- 浮动操作按钮菜单 -->
    <div class="fab-container" @click.stop>
      <!-- 切换背景按钮 -->
      <transition name="fab-item">
        <button v-show="showFabMenu" @click="changeBackground" class="change-bg-btn" title="切换背景" :disabled="bgLoading">
          <svg v-if="!bgLoading" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <path d="M21 15l-5-5L5 21"></path>
          </svg>
          <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          </svg>
        </button>
      </transition>

      <!-- 批量添加悬浮按钮 -->
      <transition name="fab-item">
        <button v-if="activeMenu" v-show="showFabMenu" @click="openBatchAddModal" class="batch-add-btn" title="批量添加网站">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
        </button>
      </transition>
      
      
      <!-- 退出编辑模式按钮 -->
      <transition name="fab-item">
        <button 
          v-if="editMode" 
          v-show="showFabMenu" 
          @click="exitEditMode" 
          class="exit-edit-btn" 
          title="退出编辑模式"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"></path>
          </svg>
        </button>
      </transition>
      
      <!-- 进入编辑模式按钮 -->
      <transition name="fab-item">
        <button 
          v-if="!editMode" 
          v-show="showFabMenu" 
          @click="enterEditMode" 
          class="edit-mode-btn" 
          title="编辑模式"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
      </transition>
      
      <!-- 主切换按钮 -->
      <button @click="toggleFabMenu" class="fab-toggle-btn" title="更多功能">
        <transition name="fab-icon" mode="out-in">
          <svg v-if="!showFabMenu" key="plus" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <svg v-else key="close" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="12"></line>
          </svg>
        </transition>
      </button>
    </div>
    
    <!-- 批量添加弹窗 -->
    <div v-if="showBatchAddModal" class="modal-overlay">
      <div class="modal-content batch-modal" @click.stop>
        <div class="modal-header">
          <h3>{{ batchStep === 1 ? '验证密码' : batchStep === 2 ? '输入网址' : '预览并选择' }}</h3>
          <button @click="closeBatchAdd" class="close-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"></path>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <!-- 步骤 1: 密码验证 -->
          <div v-if="batchStep === 1" class="batch-step">
            <p class="batch-tip">请输入管理员密码以继续：</p>
            <input 
              v-model="batchPassword" 
              type="password" 
              placeholder="请输入管理员密码"
              class="batch-input"
              @keyup.enter="verifyBatchPassword"
            />
            <div class="remember-password-wrapper">
              <label>
                <input type="checkbox" v-model="rememberPassword" />
                <span>记住密码（2小时）</span>
              </label>
            </div>
            <p v-if="batchError" class="batch-error">{{ batchError }}</p>
            <div class="batch-actions">
              <button @click="closeBatchAdd" class="btn btn-cancel">取消</button>
              <button @click="verifyBatchPassword" class="btn btn-primary" :disabled="batchLoading">
                {{ batchLoading ? '验证中...' : '确认' }}
              </button>
            </div>
          </div>
          
          <!-- 步骤 2: 输入网址 -->
          <div v-if="batchStep === 2" class="batch-step">
            <p class="batch-tip">请输入需要添加的网址，每行一个：</p>
            <textarea 
              v-model="batchUrls" 
              placeholder="例如：&#10;https://github.com&#10;https://google.com&#10;https://stackoverflow.com"
              class="batch-textarea"
              rows="10"
            ></textarea>
            <p v-if="batchError" class="batch-error">{{ batchError }}</p>
            <div class="batch-actions">
              <button @click="handleBackToPassword" class="btn btn-cancel">上一步</button>
              <button @click="parseUrls" class="btn btn-primary" :disabled="batchLoading || !batchUrls.trim()">
                {{ batchLoading ? '解析中...' : '下一步' }}
              </button>
            </div>
          </div>
          
          <!-- 步骤 3: 预览选择 -->
          <div v-if="batchStep === 3" class="batch-step">
            <p class="batch-tip">请选择需要添加的网站：</p>
            <div class="batch-preview-list">
              <div v-for="(item, index) in parsedCards" :key="index" class="batch-preview-item">
                <input type="checkbox" v-model="item.selected" :id="`card-${index}`" />
                <div class="batch-card-preview">
                  <img :src="item.logo" :alt="item.title" class="batch-card-logo" @error="e => e.target.src = '/default-favicon.png'" />
                  <div class="batch-card-info">
                    <div class="batch-edit-field">
                      <label>标题：</label>
                      <input type="text" v-model="item.title" class="batch-edit-input" />
                    </div>
                    <div class="batch-edit-field">
                      <label>Logo：</label>
                      <input type="text" v-model="item.logo" class="batch-edit-input" />
                    </div>
                    <div class="batch-edit-field">
                      <label>描述：</label>
                      <textarea v-model="item.description" class="batch-edit-textarea" rows="2"></textarea>
                    </div>
                    <div class="batch-edit-field" v-if="allTags.length > 0">
                      <label>标签：</label>
                      <div class="batch-tags-selector">
                        <!-- 推荐标签区域 -->
                        <div v-if="item.recommendedTagIds && item.recommendedTagIds.length > 0" class="recommended-tags-section">
                          <div class="recommended-tags-header">
                            <span class="recommend-badge">? 智能推荐</span>
                          </div>
                          <div class="recommended-tags-list">
                            <label 
                              v-for="tagId in item.recommendedTagIds" 
                              :key="'rec-' + tagId" 
                              class="batch-tag-option recommended"
                            >
                              <input 
                                type="checkbox" 
                                :checked="item.tagIds && item.tagIds.includes(tagId)"
                                @change="toggleBatchCardTag(item, tagId)"
                              />
                              <span class="batch-tag-label" :style="{ backgroundColor: getTagById(tagId)?.color }">
                                {{ getTagById(tagId)?.name }}
                              </span>
                            </label>
                          </div>
                        </div>
                        <!-- 其他标签区域 -->
                        <div v-if="getOtherTags(item).length > 0" class="other-tags-section">
                          <div class="other-tags-header">其他标签</div>
                          <div class="other-tags-list">
                            <label 
                              v-for="tag in getOtherTags(item)" 
                              :key="'other-' + tag.id" 
                              class="batch-tag-option"
                            >
                              <input 
                                type="checkbox" 
                                :checked="item.tagIds && item.tagIds.includes(tag.id)"
                                @change="toggleBatchCardTag(item, tag.id)"
                              />
                              <span class="batch-tag-label" :style="{ backgroundColor: tag.color }">
                                {{ tag.name }}
                              </span>
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                    <p class="batch-card-url">{{ item.url }}</p>
                    <p v-if="!item.success" class="batch-card-warning">?? {{ item.error }}</p>
                  </div>
                </div>
              </div>
            </div>
            <p v-if="batchError" class="batch-error">{{ batchError }}</p>
            <div class="batch-actions">
              <button @click="batchStep = 2" class="btn btn-cancel">上一步</button>
              <button @click="addSelectedCards" class="btn btn-primary" :disabled="batchLoading || selectedCardsCount === 0">
                {{ batchLoading ? '添加中...' : `添加 (${selectedCardsCount})` }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <footer class="footer">
      <div class="footer-content">
        <button @click="showFriendLinks = true" class="friend-link-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
          </svg>
          友情链接
        </button>
        <p class="copyright">Copyright ? 2025 Con-Nav-Item | <a href="https://github.com/zczy-k/Con-Nav-Item" target="_blank" class="footer-link">Powered by zczy-k</a></p>
      </div>
    </footer>

    <!-- 编辑模式密码验证弹窗 -->
    <div v-if="showEditPasswordModal" class="modal-overlay" @click="showEditPasswordModal = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>进入编辑模式</h3>
          <button @click="showEditPasswordModal = false" class="close-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"></path>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <p style="margin-bottom: 15px;">请输入管理员密码以继续：</p>
          <input 
            v-model="editPassword" 
            type="password" 
            placeholder="请输入管理员密码"
            class="batch-input"
            @keyup.enter="verifyEditPassword"
            style="width: 100%;"
          />
          <div class="remember-password-wrapper">
            <label>
              <input type="checkbox" v-model="rememberEditPassword" />
              <span>记住密码（2小时）</span>
            </label>
          </div>
          <p v-if="editError" class="batch-error">{{ editError }}</p>
          <div class="batch-actions" style="margin-top: 20px;">
            <button @click="showEditPasswordModal = false" class="btn btn-cancel">取消</button>
            <button @click="verifyEditPassword" class="btn btn-primary" :disabled="editLoading">
              {{ editLoading ? '验证中...' : '确认' }}
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 友情链接弹窗 -->
    <div v-if="showFriendLinks" class="modal-overlay" @click="showFriendLinks = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>友情链接</h3>
          <button @click="showFriendLinks = false" class="close-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"></path>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="friend-links-grid">
            <a 
              v-for="friend in friendLinks" 
              :key="friend.id" 
              :href="friend.url" 
              target="_blank" 
              class="friend-link-card"
            >
              <div class="friend-link-logo">
                <img 
                  v-if="friend.logo" 
                  :src="friend.logo" 
                  :alt="friend.title"
                  loading="lazy"
                  @error="handleLogoError"
                />
                <div v-else class="friend-link-placeholder">
                  {{ friend.title.charAt(0) }}
                </div>
              </div>
              <div class="friend-link-info">
                <h4>{{ friend.title }}</h4>
              </div>
            </a>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 卡片编辑弹窗 -->
    <div v-if="showEditCardModal" class="modal-overlay">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>编辑卡片</h3>
          <button @click="closeEditCardModal" class="close-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"></path>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="edit-card-form">
            <div class="form-group">
              <label>标题</label>
              <input 
                v-model="cardEditForm.title" 
                type="text" 
                placeholder="请输入标题"
                class="batch-input"
              />
            </div>
            <div class="form-group">
              <label>网址</label>
              <input 
                v-model="cardEditForm.url" 
                type="url" 
                placeholder="请输入网址"
                class="batch-input"
              />
            </div>
            <div class="form-group">
              <label>Logo 链接</label>
              <input 
                v-model="cardEditForm.logo_url" 
                type="url" 
                placeholder="请输入 Logo 图片链接"
                class="batch-input"
              />
            </div>
            <div class="form-group">
              <label>描述</label>
              <textarea 
                v-model="cardEditForm.desc" 
                placeholder="请输入描述"
                class="batch-textarea"
                rows="4"
              ></textarea>
            </div>
            <div class="form-group">
              <label>标签</label>
              <div class="tag-select-area">
                <div class="selected-tags">
                  <span 
                    v-for="tagId in cardEditForm.tagIds" 
                    :key="tagId"
                    class="selected-tag"
                    :style="{ backgroundColor: getTagById(tagId)?.color || '#666' }"
                  >
                    {{ getTagById(tagId)?.name || '未知' }}
                    <button @click="removeTag(tagId)" class="remove-tag-btn">×</button>
                  </span>
                </div>
                <div class="available-tags">
                  <button 
                    v-for="tag in availableTagsForEdit" 
                    :key="tag.id"
                    @click="addTag(tag.id)"
                    class="available-tag-btn"
                    :style="{ borderColor: tag.color, color: tag.color }"
                  >
                    + {{ tag.name }}
                  </button>
                </div>
              </div>
            </div>
            <p v-if="editError" class="batch-error">{{ editError }}</p>
            <div class="batch-actions" style="margin-top: 20px;">
              <button @click="closeEditCardModal" class="btn btn-cancel">取消</button>
              <button @click="saveCardEdit" class="btn btn-primary" :disabled="editLoading">
                {{ editLoading ? '保存中...' : '保存' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 添加搜索引擎弹窗 -->
    <div v-if="showAddEngineModal" class="modal-overlay">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>{{ engineStep === 1 ? '添加搜索引擎 - 输入URL' : '添加搜索引擎 - 编辑信息' }}</h3>
          <button @click="closeAddEngineModal" class="close-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"></path>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <!-- 步骤1：输入URL -->
          <div v-if="engineStep === 1">
            <div class="form-group">
              <label>搜索引擎URL</label>
              <input 
                v-model="engineUrl" 
                type="url" 
                placeholder="例如：https://www.google.com"
                class="batch-input"
                @keyup.enter="parseEngineUrl"
              />
              <p style="font-size: 12px; color: #666; margin-top: 5px;">输入搜索引擎的主页地址，系统会自动解析</p>
            </div>
            <p v-if="engineError" class="batch-error">{{ engineError }}</p>
            <div class="batch-actions" style="margin-top: 20px;">
              <button @click="closeAddEngineModal" class="btn btn-cancel">取消</button>
              <button @click="parseEngineUrl" class="btn btn-primary" :disabled="engineLoading || !engineUrl">
                {{ engineLoading ? '解析中...' : '下一步' }}
              </button>
            </div>
          </div>
          
          <!-- 步骤2：编辑解析后的信息 -->
          <div v-if="engineStep === 2">
            <div class="form-group">
              <label>名称</label>
              <input 
                v-model="newEngine.name" 
                type="text" 
                placeholder="例如：Google"
                class="batch-input"
              />
            </div>
            <div class="form-group">
              <label>搜索URL模板</label>
              <input 
                v-model="newEngine.searchUrl" 
                type="text" 
                placeholder="例如：https://www.google.com/search?q={searchTerms}"
                class="batch-input"
              />
              <p style="font-size: 12px; color: #666; margin-top: 5px;">使用 {searchTerms} 作为搜索关键词占位符</p>
            </div>
            <div class="form-group">
              <label>关键词（可选）</label>
              <input 
                v-model="newEngine.keyword" 
                type="text" 
                placeholder="例如：google"
                class="batch-input"
              />
              <p style="font-size: 12px; color: #666; margin-top: 5px;">用于快捷键搜索，例如输入 'g 关键词' 使用Google搜索</p>
            </div>
            <p v-if="engineError" class="batch-error">{{ engineError }}</p>
            <div class="batch-actions" style="margin-top: 20px;">
              <button @click="engineStep = 1" class="btn btn-cancel">上一步</button>
              <button @click="addCustomEngine" class="btn btn-primary" :disabled="engineLoading">
                {{ engineLoading ? '添加中...' : '添加' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Toast 提示 -->
    <transition name="toast">
      <div v-if="showToast" class="toast-notification">
        {{ toastMessage }}
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeMount, computed, defineAsyncComponent, onUnmounted } from 'vue';
import { getMenus, getCards, getAds, getFriends, verifyPassword, batchParseUrls, batchAddCards, getRandomWallpaper, batchUpdateCards, deleteCard, updateCard, getSearchEngines, parseSearchEngine, addSearchEngine, deleteSearchEngine, getTags } from '../api';
import MenuBar from '../components/MenuBar.vue';
const CardGrid = defineAsyncComponent(() => import('../components/CardGrid.vue'));

const menus = ref([]);
const activeMenu = ref(null);
const activeSubMenu = ref(null);
const cards = ref([]);
const allCards = ref([]); // 存储所有菜单的卡片，用于搜索
const searchQuery = ref('');
const leftAds = ref([]);
const rightAds = ref([]);
const showFriendLinks = ref(false);
const friendLinks = ref([]);
const allTags = ref([]);
const selectedTagId = ref(null);
const showTagPanel = ref(false); // 标签选择浮层

// 批量添加相关状态
const showBatchAddModal = ref(false);
const batchStep = ref(1); // 1:密码验证 2:输入网址 3:预览选择
const batchPassword = ref('');
const batchUrls = ref('');
const batchLoading = ref(false);
const batchError = ref('');
const parsedCards = ref([]);
const rememberPassword = ref(false);

// 编辑模式相关状态
const editMode = ref(false);
const editPassword = ref('');
const showEditPasswordModal = ref(false);
const editLoading = ref(false);
const editError = ref('');
const rememberEditPassword = ref(false);

// 批量移动相关状态
const selectedCards = ref([]);
const showMovePanel = ref(false);
const targetMenuId = ref(null);
const targetSubMenuId = ref(null);

// Toast 提示状态
const toastMessage = ref('');
const showToast = ref(false);

// 卡片编辑模态框相关状态
const showEditCardModal = ref(false);
const editingCard = ref(null);
const cardEditForm = ref({
  title: '',
  url: '',
  logo_url: '',
  desc: '',
  tagIds: []
});

// FAB 菜单
const showFabMenu = ref(false);

function toggleFabMenu() {
  showFabMenu.value = !showFabMenu.value;
}

function closeFabMenu() {
  if (showFabMenu.value) {
    showFabMenu.value = false;
  }
}

// 背景切换相关
const bgLoading = ref(false);

const selectedCardsCount = computed(() => {
  return parsedCards.value.filter(card => card.selected).length;
});

// 默认搜索引擎配置
const defaultEngines = [
  {
    name: 'google',
    label: 'Google',
    url: q => `https://www.google.com/search?q=${encodeURIComponent(q)}`
  },
  {
    name: 'baidu',
    label: '百度',
    url: q => `https://www.baidu.com/s?wd=${encodeURIComponent(q)}`
  },
  {
    name: '360',
    label: '360搜索',
    url: q => `https://www.so.com/s?q=${encodeURIComponent(q)}`
  },
  {
    name: 'sogou',
    label: '搜狗',
    url: q => `https://www.sogou.com/web?query=${encodeURIComponent(q)}`
  },
  {
    name: 'bing',
    label: 'Bing',
    url: q => `https://www.bing.com/search?q=${encodeURIComponent(q)}`
  },
  {
    name: 'github',
    label: 'GitHub',
    url: q => `https://github.com/search?q=${encodeURIComponent(q)}&type=repositories`
  },
  {
    name: 'duckduckgo',
    label: 'DuckDuckGo',
    url: q => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`
  },
  {
    name: 'yahoo',
    label: 'Yahoo',
    url: q => `https://search.yahoo.com/search?p=${encodeURIComponent(q)}`
  },
  {
    name: 'yandex',
    label: 'Yandex',
    url: q => `https://yandex.com/search/?text=${encodeURIComponent(q)}`
  }
];

const searchEngines = ref([]);
const selectedEngine = ref(null);

// 自定义搜索引擎相关状态
const showAddEngineModal = ref(false);
const showEngineDropdown = ref(false);
const engineError = ref('');
const engineLoading = ref(false);
const engineStep = ref(1); // 1:输入URL 2:编辑信息
const engineUrl = ref('');
const newEngine = ref({
  name: '',
  searchUrl: '',
  keyword: ''
});

// 搜索引擎配置版本号（移除图标功能后）
const ENGINE_CONFIG_VERSION = '3.0';


function selectEngine(engine) {
  selectedEngine.value = engine;
  // 保存到 localStorage
  try {
    localStorage.setItem('default_search_engine', engine.name);
  } catch (e) {
    console.error('Failed to save default search engine:', e);
  }
}

// 切换下拉菜单显示
function toggleEngineDropdown() {
  showEngineDropdown.value = !showEngineDropdown.value;
}

// 从下拉菜单选择搜索引擎
function selectEngineFromDropdown(engine) {
  selectEngine(engine);
  showEngineDropdown.value = false;
}

function clearSearch() {
  searchQuery.value = '';
}

// 标签筛选控制
function toggleTagFilter(tagId) {
  selectedTagId.value = selectedTagId.value === tagId ? null : tagId;
}

function clearTagFilter() {
  selectedTagId.value = null;
}

function selectTag(tagId) {
  selectedTagId.value = selectedTagId.value === tagId ? null : tagId;
  showTagPanel.value = false;
}

// 打开添加搜索引擎弹窗(需要先验证密码)
async function openAddEngineModal() {
  // 检查是否已登录
  const token = localStorage.getItem('token');
  if (!token) {
    // 没有token，需要先登录
    const password = prompt('请输入管理员密码以添加搜索引擎：');
    if (!password) {
      showEngineDropdown.value = false;
      return;
    }
    
    try {
      const res = await login('admin', password);
      localStorage.setItem('token', res.data.token);
    } catch (error) {
      alert('密码错误');
      showEngineDropdown.value = false;
      return;
    }
  }
  
  showAddEngineModal.value = true;
  engineStep.value = 1;
  engineError.value = '';
  engineUrl.value = '';
  newEngine.value = {
    name: '',
    searchUrl: '',
    keyword: ''
  };
}

// 关闭添加搜索引擎弹窗
function closeAddEngineModal() {
  showAddEngineModal.value = false;
  engineStep.value = 1;
  engineError.value = '';
  engineUrl.value = '';
  showEngineDropdown.value = false;
}

// 解析搜索引擎URL
async function parseEngineUrl() {
  if (!engineUrl.value.trim()) {
    engineError.value = '请输入URL';
    return;
  }
  
  engineLoading.value = true;
  engineError.value = '';
  
  try {
    const res = await parseSearchEngine(engineUrl.value);
    newEngine.value = {
      name: res.data.name,
      searchUrl: res.data.searchUrl,
      keyword: res.data.keyword
    };
    engineStep.value = 2;
  } catch (error) {
    engineError.value = error.response?.data?.error || '解析失败，请检查URL是否正确';
  } finally {
    engineLoading.value = false;
  }
}

// 添加自定义搜索引擎
async function addCustomEngine() {
  if (!newEngine.value.name.trim()) {
    engineError.value = '请输入搜索引擎名称';
    return;
  }
  if (!newEngine.value.searchUrl.trim()) {
    engineError.value = '请输入搜索URL模板';
    return;
  }
  if (!newEngine.value.searchUrl.includes('{searchTerms}')) {
    engineError.value = '搜索URL模板必须包含 {searchTerms} 占位符';
    return;
  }
  
  engineLoading.value = true;
  engineError.value = '';
  
  try {
    const res = await addSearchEngine({
      name: newEngine.value.name,
      search_url: newEngine.value.searchUrl,
      keyword: newEngine.value.keyword
    });
    
    // 添加到前端列表
    const customEngine = {
      name: 'custom_' + res.data.id,
      label: res.data.name,
      icon: '??',
      placeholder: `${res.data.name} 搜索...`,
      url: q => res.data.search_url.replace('{searchTerms}', encodeURIComponent(q)),
      custom: true,
      id: res.data.id,
      keyword: res.data.keyword
    };
    searchEngines.value.push(customEngine);
    
    showToastMessage('搜索引擎添加成功');
    closeAddEngineModal();
  } catch (error) {
    engineError.value = error.response?.data?.error || '添加失败';
  } finally {
    engineLoading.value = false;
  }
}

// 删除自定义搜索引擎
async function deleteCustomEngine(engine) {
  if (!confirm(`确定要删除「${engine.label}」搜索引擎吗？`)) return;
  
  // 检查是否已登录
  const token = localStorage.getItem('token');
  if (!token) {
    const password = prompt('请输入管理员密码以删除搜索引擎：');
    if (!password) return;
    
    try {
      const res = await login('admin', password);
      localStorage.setItem('token', res.data.token);
    } catch (error) {
      alert('密码错误');
      return;
    }
  }
  
  try {
    await deleteSearchEngine(engine.id);
    
    // 从列表中移除
    const index = searchEngines.value.findIndex(e => e.name === engine.name);
    if (index > -1) {
      searchEngines.value.splice(index, 1);
    }
    
    // 如果删除的是当前选中的引擎，切换到第一个
    if (selectedEngine.value.name === engine.name) {
      selectedEngine.value = searchEngines.value[0];
      selectEngine(searchEngines.value[0]);
    }
    
    showToastMessage('删除成功');
  } catch (error) {
    alert('删除失败：' + (error.response?.data?.error || error.message));
  }
}

const filteredCards = computed(() => {
  let result = cards.value;
  
  // 先应用标签筛选
  if (selectedTagId.value) {
    result = result.filter(card => 
      card.tags && card.tags.some(tag => tag.id === selectedTagId.value)
    );
  }
  
  // 再应用搜索筛选
  if (searchQuery.value) {
    const searchQueryLower = searchQuery.value.toLowerCase();
    // 在当前结果集中搜索
    result = result.filter(card => 
      card.title.toLowerCase().includes(searchQueryLower) ||
      card.url.toLowerCase().includes(searchQueryLower) ||
      (card.desc && card.desc.toLowerCase().includes(searchQueryLower))
    );
  }
  
  return result;
});

// 在组件渲染前应用保存的背景，避免闪烁
onBeforeMount(() => {
  const savedBg = localStorage.getItem('nav_background');
  if (savedBg) {
    // 在 nextTick 中应用，确保 DOM 元素存在
    document.addEventListener('DOMContentLoaded', () => {
      const homeContainer = document.querySelector('.home-container');
      if (homeContainer) {
        homeContainer.style.backgroundImage = `url(${savedBg})`;
        homeContainer.style.backgroundSize = 'cover';
        homeContainer.style.backgroundPosition = 'center';
        homeContainer.style.backgroundRepeat = 'no-repeat';
        homeContainer.style.backgroundAttachment = 'fixed';
      }
    });
  }
});

onMounted(async () => {
  // 并行加载所有独立数据：菜单、广告、友链、标签、自定义搜索引擎
  const [menusRes, adsRes, friendsRes, tagsRes, enginesRes] = await Promise.allSettled([
    getMenus(),
    getAds(),
    getFriends(),
    getTags(),
    getSearchEngines()
  ]);
  
  // 处理菜单数据（优先级最高）
  if (menusRes.status === 'fulfilled') {
    menus.value = menusRes.value.data;
    if (menus.value.length) {
      activeMenu.value = menus.value[0];
      loadCards();
      // 异步加载所有卡片用于搜索（不阻塞主流程）
      loadAllCardsForSearch();
    }
  }
  
  // 处理广告数据
  if (adsRes.status === 'fulfilled') {
    leftAds.value = adsRes.value.data.filter(ad => ad.position === 'left');
    rightAds.value = adsRes.value.data.filter(ad => ad.position === 'right');
  }
  
  // 处理友链数据
  if (friendsRes.status === 'fulfilled') {
    friendLinks.value = friendsRes.value.data;
  }
  
  // 处理标签数据
  if (tagsRes.status === 'fulfilled') {
    allTags.value = tagsRes.value.data;
  } else {
    console.error('加载标签失败:', tagsRes.reason);
  }
  
  // 处理自定义搜索引擎
  if (enginesRes.status === 'fulfilled') {
    const customEngines = enginesRes.value.data.map(engine => ({
      name: 'custom_' + engine.id,
      label: engine.name,
      iconUrl: null,
      iconFallback: '??',
      placeholder: `${engine.name} 搜索...`,
      url: q => engine.search_url.replace('{searchTerms}', encodeURIComponent(q)),
      custom: true,
      id: engine.id,
      keyword: engine.keyword
    }));
    searchEngines.value = [...defaultEngines, ...customEngines];
  } else {
    console.error('加载自定义搜索引擎失败:', enginesRes.reason);
    searchEngines.value = [...defaultEngines];
  }

  // 从 localStorage 初始化默认搜索引擎
  try {
    const savedVersion = localStorage.getItem('engine_config_version');
    if (savedVersion !== ENGINE_CONFIG_VERSION) {
      // 清除所有搜索引擎相关缓存
      localStorage.removeItem('default_search_engine');
      localStorage.removeItem('search_engines'); // 清除可能存在的旧缓存
      localStorage.setItem('engine_config_version', ENGINE_CONFIG_VERSION);
    }

    const savedEngineName = localStorage.getItem('default_search_engine');
    let engineToSelect = searchEngines.value[0];
    if (savedEngineName) {
      const foundEngine = searchEngines.value.find(e => e.name === savedEngineName);
      if (foundEngine) {
        engineToSelect = foundEngine;
      }
    }
    selectEngine(engineToSelect);
  } catch (e) {
    console.error('Failed to set default search engine:', e);
    if (searchEngines.value.length > 0) {
      selectEngine(searchEngines.value[0]);
    }
  }
  
  // 再次检查并应用背景（防止 onBeforeMount 没有执行）
  const savedBg = localStorage.getItem('nav_background');
  if (savedBg) {
    const homeContainer = document.querySelector('.home-container');
    if (homeContainer && !homeContainer.style.backgroundImage.includes(savedBg)) {
      homeContainer.style.backgroundImage = `url(${savedBg})`;
      homeContainer.style.backgroundSize = 'cover';
      homeContainer.style.backgroundPosition = 'center';
      homeContainer.style.backgroundRepeat = 'no-repeat';
      homeContainer.style.backgroundAttachment = 'fixed';
    }
  }
  
  // 检查是否有保存的密码token
  checkSavedPassword();
  
  document.addEventListener('click', closeFabMenu);
  document.addEventListener('click', closeEngineDropdown);
});


onUnmounted(() => {
  document.removeEventListener('click', closeFabMenu);
  document.removeEventListener('click', closeEngineDropdown);
});

// 关闭搜索引擎下拉菜单
function closeEngineDropdown() {
  if (showEngineDropdown.value) {
    showEngineDropdown.value = false;
  }
}

async function selectMenu(menu, parentMenu = null) {
  if (parentMenu) {
    // 选择的是子菜单
    activeMenu.value = parentMenu;
    activeSubMenu.value = menu;
  } else {
    // 选择的是主菜单
    activeMenu.value = menu;
    activeSubMenu.value = null;
  }
  loadCards();
}

// 加载所有分类的卡片（编辑模式用）
const allCategoryCards = ref({});

async function loadCards() {
  if (!activeMenu.value) return;
  const res = await getCards(activeMenu.value.id, activeSubMenu.value?.id);
  cards.value = res.data;
}

// 加载所有卡片用于搜索（优化版：并行加载）
async function loadAllCardsForSearch() {
  const promises = [];
  
  for (const menu of menus.value) {
    // 并行加载主菜单的卡片
    promises.push(
      getCards(menu.id, null)
        .then(res => res.data)
        .catch(error => {
          console.error(`加载菜单 ${menu.name} 的卡片失败:`, error);
          return [];
        })
    );
    
    // 并行加载子菜单的卡片
    if (menu.subMenus && menu.subMenus.length) {
      for (const subMenu of menu.subMenus) {
        promises.push(
          getCards(menu.id, subMenu.id)
            .then(res => res.data)
            .catch(error => {
              console.error(`加载子菜单 ${subMenu.name} 的卡片失败:`, error);
              return [];
            })
        );
      }
    }
  }
  
  // 等待所有请求完成，合并结果
  const results = await Promise.all(promises);
  allCards.value = results.flat();
}

// 加载所有分类的卡片（优化版：并行加载）
async function loadAllCards() {
  const promises = [];
  const keys = [];
  
  for (const menu of menus.value) {
    const key = `${menu.id}_null`;
    keys.push(key);
    promises.push(
      getCards(menu.id, null)
        .then(res => res.data)
        .catch(() => [])
    );
    
    // 并行加载子分类
    if (menu.subMenus && menu.subMenus.length) {
      for (const subMenu of menu.subMenus) {
        const subKey = `${menu.id}_${subMenu.id}`;
        keys.push(subKey);
        promises.push(
          getCards(menu.id, subMenu.id)
            .then(res => res.data)
            .catch(() => [])
        );
      }
    }
  }
  
  const results = await Promise.all(promises);
  const tempCards = {};
  results.forEach((cards, index) => {
    tempCards[keys[index]] = cards;
  });
  allCategoryCards.value = tempCards;
}

// 根据分类ID获取卡片
function getCategoryCards(menuId, subMenuId) {
  const key = `${menuId}_${subMenuId}`;
  return allCategoryCards.value[key] || [];
}

async function handleSearch() {
  if (!searchQuery.value.trim()) return;
  if (selectedEngine.value.name === 'site') {
    // 站内搜索：遍历所有菜单，查找所有卡片
    let found = false;
    for (const menu of menus.value) {
      const res = await getCards(menu.id);
      const match = res.data.find(card =>
        card.title.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
        card.url.toLowerCase().includes(searchQuery.value.toLowerCase())
      );
      if (match) {
        activeMenu.value = menu;
        cards.value = res.data;
        setTimeout(() => {
          const el = document.querySelector(`[data-card-id='${match.id}']`);
          if (el) el.scrollIntoView({behavior: 'smooth', block: 'center'});
        }, 100);
        found = true;
        break;
      }
    }
    if (!found) {
      alert('未找到相关内容');
    }
  } else {
    const url = selectedEngine.value.url(searchQuery.value);
    window.open(url, '_blank');
  }
}

// 获取搜索引擎图标
function getEngineIcon(engine) {
  if (engine.iconUrl) return engine.iconUrl;
  const origin = new URL(engine.url('')).origin;
  return `https://api.xinac.net/icon/?url=${origin}&sz=128`;
}

// 处理搜索引擎图标错误
function handleEngineIconError(event) {
  event.target.src = '/default-favicon.png';
}

// 批量添加相关函数
// 打开批量添加弹窗，检查是否有有效的token
async function openBatchAddModal() {
  showBatchAddModal.value = true;
  batchError.value = '';
  
  // 检查是否有保存的密码token
  const savedData = localStorage.getItem('nav_password_token');
  if (savedData) {
    try {
      const { password, expiry, token } = JSON.parse(savedData);
      if (Date.now() < expiry && token) {
        // token未过期，恢复token并直接跳到第二步
        localStorage.setItem('token', token);
        batchPassword.value = password;
        rememberPassword.value = true;
        batchStep.value = 2;
        return;
      } else {
        // 已过期，清除
        localStorage.removeItem('nav_password_token');
      }
    } catch (e) {
      localStorage.removeItem('nav_password_token');
    }
  }
  
  // 没有有效token，显示密码验证步骤
  batchStep.value = 1;
}

function closeBatchAdd() {
  showBatchAddModal.value = false;
  batchStep.value = 1;
  batchPassword.value = '';
  batchUrls.value = '';
  batchError.value = '';
  parsedCards.value = [];
  batchLoading.value = false;
}

// 检查保存的密码
function checkSavedPassword() {
  const savedData = localStorage.getItem('nav_password_token');
  if (savedData) {
    try {
      const { password, expiry, token } = JSON.parse(savedData);
      if (Date.now() < expiry) {
        // 密码未过期，自动填充并恢复token
        batchPassword.value = password;
        rememberPassword.value = true;
        // 如果有保存的token，也恢复它
        if (token) {
          localStorage.setItem('token', token);
        }
      } else {
        // 已过期，清除
        localStorage.removeItem('nav_password_token');
      }
    } catch (e) {
      localStorage.removeItem('nav_password_token');
    }
  }
}

async function verifyBatchPassword() {
  if (!batchPassword.value) {
    batchError.value = '请输入密码';
    return;
  }
  
  batchLoading.value = true;
  batchError.value = '';
  
  try {
    // 仅使用密码验证，不需要用户名
    const response = await verifyPassword(batchPassword.value);
    
    // 检查并保存 token
    if (response.data && response.data.token) {
      localStorage.setItem('token', response.data.token);
    } else {
      throw new Error('验证成功，但未收到 token');
    }
    
    // 如果选择了记住密码，保存到2小时
    if (rememberPassword.value) {
      const expiry = Date.now() + 2 * 60 * 60 * 1000; // 2小时
      localStorage.setItem('nav_password_token', JSON.stringify({
        password: batchPassword.value,
        token: response.data.token,
        expiry
      }));
    } else {
      localStorage.removeItem('nav_password_token');
    }
    
    batchStep.value = 2;
  } catch (error) {
    batchError.value = '密码错误，请重试';
    console.error('密码验证失败:', error);
  } finally {
    batchLoading.value = false;
  }
}

// 返回密码验证步骤（清除保存的token）
function handleBackToPassword() {
  // 清除保存的token，要求重新验证
  localStorage.removeItem('nav_password_token');
  localStorage.removeItem('token');
  batchPassword.value = '';
  rememberPassword.value = false;
  batchStep.value = 1;
}

// 智能标签推荐规则：基于域名和关键词
const TAG_RECOMMENDATION_RULES = [
  // 开发工具类
  { domains: ['github.com', 'gitlab.com', 'gitee.com', 'bitbucket.org'], keywords: ['git', '代码', 'code'], tags: ['开发工具', '代码托管'] },
  { domains: ['stackoverflow.com', 'stackexchange.com'], keywords: ['问答', 'q&a'], tags: ['开发工具', '问答社区'] },
  { domains: ['npmjs.com', 'pypi.org', 'packagist.org', 'maven.org'], keywords: ['package', '包管理'], tags: ['开发工具', '包管理'] },
  { domains: ['docker.com', 'kubernetes.io'], keywords: ['docker', 'k8s', '容器'], tags: ['开发工具', '云原生'] },
  
  // 搜索引擎类
  { domains: ['google.com', 'bing.com', 'baidu.com', 'sogou.com', 'so.com', 'duckduckgo.com', 'yahoo.com'], keywords: ['搜索', 'search'], tags: ['搜索引擎'] },
  
  // 视频娱乐类
  { domains: ['youtube.com', 'bilibili.com', 'youku.com', 'iqiyi.com', 'tencent.com/v'], keywords: ['视频', 'video', '影视'], tags: ['视频', '娱乐'] },
  { domains: ['netflix.com', 'primevideo.com', 'disneyplus.com'], keywords: ['流媒体', 'streaming'], tags: ['视频', '娱乐', '流媒体'] },
  
  // 社交媒体类
  { domains: ['twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'linkedin.com'], keywords: ['社交', 'social'], tags: ['社交媒体'] },
  { domains: ['weibo.com', 'douban.com'], keywords: ['微博', '社区'], tags: ['社交媒体', '社区'] },
  
  // 学习教育类
  { domains: ['coursera.org', 'udemy.com', 'edx.org', 'khanacademy.org'], keywords: ['课程', 'course', '学习'], tags: ['学习', '教育'] },
  { domains: ['zhihu.com', 'quora.com'], keywords: ['知识', '问答'], tags: ['问答社区', '学习'] },
  { domains: ['medium.com', 'dev.to', 'csdn.net', 'cnblogs.com', 'juejin.cn'], keywords: ['博客', 'blog', '技术'], tags: ['技术博客', '学习'] },
  
  // 设计创作类
  { domains: ['figma.com', 'sketch.com', 'adobe.com'], keywords: ['设计', 'design', 'ui'], tags: ['设计工具', '创作'] },
  { domains: ['dribbble.com', 'behance.net'], keywords: ['灵感', 'inspiration'], tags: ['设计', '灵感'] },
  
  // 云服务类
  { domains: ['aws.amazon.com', 'cloud.google.com', 'azure.microsoft.com', 'aliyun.com', 'tencent.com/cloud'], keywords: ['云计算', 'cloud'], tags: ['云服务'] },
  
  // 邮箱类
  { domains: ['gmail.com', 'outlook.com', 'qq.com/mail', '163.com', '126.com'], keywords: ['邮箱', 'email', 'mail'], tags: ['邮箱'] },
  
  // 工具类
  { domains: ['notion.so', 'evernote.com', 'onenote.com'], keywords: ['笔记', 'note'], tags: ['效率工具', '笔记'] },
  { domains: ['trello.com', 'asana.com', 'jira.atlassian.com'], keywords: ['项目管理', 'project'], tags: ['效率工具', '项目管理'] },
  
  // AI工具类
  { domains: ['openai.com', 'chat.openai.com', 'claude.ai', 'bard.google.com'], keywords: ['ai', '人工智能', 'gpt'], tags: ['AI工具'] },
  
  // 编程学习类
  { domains: ['leetcode.com', 'leetcode.cn', 'codewars.com', 'hackerrank.com'], keywords: ['算法', 'algorithm', '刷题'], tags: ['编程学习', '算法'] },
];

// 智能推荐标签
function recommendTags(url, title) {
  const recommendedTagNames = new Set();
  
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.toLowerCase().replace('www.', '');
    const titleLower = (title || '').toLowerCase();
    
    // 遍历推荐规则
    for (const rule of TAG_RECOMMENDATION_RULES) {
      let matched = false;
      
      // 检查域名匹配
      if (rule.domains) {
        for (const ruleDomain of rule.domains) {
          if (domain.includes(ruleDomain) || ruleDomain.includes(domain)) {
            matched = true;
            break;
          }
        }
      }
      
      // 检查关键词匹配
      if (!matched && rule.keywords && title) {
        for (const keyword of rule.keywords) {
          if (titleLower.includes(keyword.toLowerCase())) {
            matched = true;
            break;
          }
        }
      }
      
      // 如果匹配，添加推荐标签
      if (matched) {
        rule.tags.forEach(tag => recommendedTagNames.add(tag));
      }
    }
  } catch (e) {
    console.warn('推荐标签失败:', e);
  }
  
  // 将推荐的标签名称转换为标签ID
  const recommendedTagIds = [];
  for (const tagName of recommendedTagNames) {
    const tag = allTags.value.find(t => t.name === tagName);
    if (tag) {
      recommendedTagIds.push(tag.id);
    }
  }
  
  return recommendedTagIds;
}

async function parseUrls() {
  const urls = batchUrls.value
    .split('\n')
    .map(url => url.trim())
    .filter(url => url.length > 0);
  
  if (urls.length === 0) {
    batchError.value = '请输入至少一个网址';
    return;
  }
  
  batchLoading.value = true;
  batchError.value = '';
  
  try {
    const response = await batchParseUrls(urls);
    parsedCards.value = response.data.data.map(card => {
      // 为每个卡片智能推荐标签
      const recommendedTagIds = recommendTags(card.url, card.title);
      return {
        ...card,
        selected: true, // 默认全选
        tagIds: recommendedTagIds, // 自动填充推荐标签
        recommendedTagIds: recommendedTagIds // 保存推荐的标签，用于UI显示
      };
    });
    batchStep.value = 3;
  } catch (error) {
    batchError.value = error.response?.data?.error || '解析失败，请重试';
  } finally {
    batchLoading.value = false;
  }
}

// 切换批量卡片的标签
function toggleBatchCardTag(card, tagId) {
  if (!card.tagIds) {
    card.tagIds = [];
  }
  const index = card.tagIds.indexOf(tagId);
  if (index > -1) {
    card.tagIds.splice(index, 1);
  } else {
    card.tagIds.push(tagId);
  }
}

// 获取非推荐的其他标签
function getOtherTags(card) {
  if (!card.recommendedTagIds || card.recommendedTagIds.length === 0) {
    return allTags.value;
  }
  return allTags.value.filter(tag => !card.recommendedTagIds.includes(tag.id));
}

async function addSelectedCards() {
  const selected = parsedCards.value.filter(card => card.selected);
  
  if (selected.length === 0) {
    batchError.value = '请至少选择一个网站';
    return;
  }
  
  batchLoading.value = true;
  batchError.value = '';
  
  try {
    const cardsToAdd = selected.map(card => ({
      title: card.title,
      url: card.url,
      logo: card.logo,
      description: card.description,
      tagIds: card.tagIds || [] // 包含标签
    }));
    
    await batchAddCards(
      activeMenu.value.id,
      activeSubMenu.value?.id || null,
      cardsToAdd
    );
    
    // 添加成功，关闭弹窗并刷新卡片列表
    alert(`成功添加 ${selected.length} 个网站！`);
    closeBatchAdd();
    await loadCards();
  } catch (error) {
    batchError.value = error.response?.data?.error || '添加失败，请重试';
  } finally {
    batchLoading.value = false;
  }
}

// 切换背景壁纸
async function changeBackground() {
  if (bgLoading.value) return;
  
  bgLoading.value = true;
  
  try {
    const response = await getRandomWallpaper();
    const wallpaperUrl = response.data.url;
    
    // 更新背景 - 直接更新或创建 <style> 标签，使用 !important 覆盖
    let bgStyle = document.getElementById('dynamic-bg-style');
    if (!bgStyle) {
      bgStyle = document.createElement('style');
      bgStyle.id = 'dynamic-bg-style';
      document.head.appendChild(bgStyle);
    }
    bgStyle.textContent = `.home-container { background-image: url(${wallpaperUrl}) !important; }`;
    
    // 保存到localStorage，下次刷新时自动应用
    localStorage.setItem('nav_background', wallpaperUrl);
  } catch (error) {
    console.error('获取壁纸失败:', error);
    alert('获取壁纸失败，请稍后重试');
  } finally {
    bgLoading.value = false;
  }
}

// ========== 编辑模式相关函数 ==========

// 进入编辑模式
async function enterEditMode() {
  // 检查是否有保存的密码token
  const savedData = localStorage.getItem('nav_password_token');
  if (savedData) {
    try {
      const { password, expiry, token } = JSON.parse(savedData);
      if (Date.now() < expiry && token) {
        // token未过期，恢复token并直接进入编辑模式
        localStorage.setItem('token', token);
        editMode.value = true;
        return;
      } else {
        // 已过期，清除
        localStorage.removeItem('nav_password_token');
      }
    } catch (e) {
      localStorage.removeItem('nav_password_token');
    }
  }
  
  // 没有有效token，显示密码验证弹窗
  showEditPasswordModal.value = true;
  editPassword.value = '';
  editError.value = '';
  
  // 检查是否有保存的密码并自动填充
  if (savedData) {
    try {
      const { password, expiry } = JSON.parse(savedData);
      if (Date.now() < expiry) {
        editPassword.value = password;
        rememberEditPassword.value = true;
      }
    } catch (e) {
      // 忽略错误
    }
  }
}

// 验证密码并进入编辑模式
async function verifyEditPassword() {
  if (!editPassword.value) {
    editError.value = '请输入密码';
    return;
  }
  
  editLoading.value = true;
  editError.value = '';
  
  try {
    // 仅使用密码验证，不需要用户名
    const res = await verifyPassword(editPassword.value);
    localStorage.setItem('token', res.data.token);
    
    // 如果选择了记住密码，保存到2小时
    if (rememberEditPassword.value) {
      const expiry = Date.now() + 2 * 60 * 60 * 1000; // 2小时
      localStorage.setItem('nav_password_token', JSON.stringify({
        password: editPassword.value,
        token: res.data.token,
        expiry
      }));
    } else {
      localStorage.removeItem('nav_password_token');
    }
    
    // 进入编辑模式
    editMode.value = true;
    showEditPasswordModal.value = false;
    editLoading.value = false;
  } catch (error) {
    editError.value = '密码错误';
    editLoading.value = false;
  }
}

// 退出编辑模式
function exitEditMode() {
  editMode.value = false;
  selectedCards.value = [];
  showMovePanel.value = false;
  targetMenuId.value = null;
  targetSubMenuId.value = null;
}

// 处理容器点击事件，点击空白退出编辑模式
function handleContainerClick(event) {
  // 只在编辑模式下生效
  if (!editMode.value) return;
  
  // 如果点击的是容器本身（空白区域），则退出编辑模式
  if (event.target.classList.contains('home-container')) {
    exitEditMode();
  }
}

// ========== 批量移动相关函数 ==========

// 取消移动
function cancelMove() {
  showMovePanel.value = false;
  targetMenuId.value = null;
  targetSubMenuId.value = null;
}

// 切换卡片选中状态
function toggleCardSelection(card) {
  const index = selectedCards.value.findIndex(c => c.id === card.id);
  if (index > -1) {
    // 取消选中
    selectedCards.value.splice(index, 1);
    // 如果没有选中的卡片了，关闭面板
    if (selectedCards.value.length === 0) {
      showMovePanel.value = false;
    }
  } else {
    // 选中
    selectedCards.value.push(card);
    // 自动打开移动面板
    if (!showMovePanel.value) {
      showMovePanel.value = true;
      targetMenuId.value = activeMenu.value?.id || null;
      targetSubMenuId.value = activeSubMenu.value?.id || null;
    }
  }
}


// 显示 Toast 提示
function showToastMessage(message, duration = 2000) {
  toastMessage.value = message;
  showToast.value = true;
  setTimeout(() => {
    showToast.value = false;
  }, duration);
}

// 移动卡片到指定分类
async function moveCardToCategory(menuId, subMenuId) {
  if (selectedCards.value.length === 0) return;
  
  try {
    const movedCardIds = selectedCards.value.map(c => c.id);
    const updates = selectedCards.value.map(card => ({
      id: card.id,
      menu_id: menuId,
      sub_menu_id: subMenuId
    }));
    
    // 批量更新
    for (const update of updates) {
      const card = selectedCards.value.find(c => c.id === update.id);
      await updateCard(update.id, {
        ...card,
        menu_id: update.menu_id,
        sub_menu_id: update.sub_menu_id
      });
    }
    
    const count = selectedCards.value.length;
    
    // 判断是否移动到当前分类
    const isMovingToCurrentCategory = 
      menuId === activeMenu.value?.id && 
      subMenuId === activeSubMenu.value?.id;
    
    if (isMovingToCurrentCategory) {
      // 移动到当前分类，更新卡片的分类信息
      movedCardIds.forEach(cardId => {
        const index = cards.value.findIndex(c => c.id === cardId);
        if (index > -1) {
          cards.value[index] = {
            ...cards.value[index],
            menu_id: menuId,
            sub_menu_id: subMenuId
          };
        }
        
        // 更新全局搜索列表
        const allIndex = allCards.value.findIndex(c => c.id === cardId);
        if (allIndex > -1) {
          allCards.value[allIndex] = {
            ...allCards.value[allIndex],
            menu_id: menuId,
            sub_menu_id: subMenuId
          };
        }
      });
    } else {
      // 移动到其他分类，从当前列表中移除
      cards.value = cards.value.filter(c => !movedCardIds.includes(c.id));
      
      // 更新全局搜索列表中的分类信息
      movedCardIds.forEach(cardId => {
        const allIndex = allCards.value.findIndex(c => c.id === cardId);
        if (allIndex > -1) {
          allCards.value[allIndex] = {
            ...allCards.value[allIndex],
            menu_id: menuId,
            sub_menu_id: subMenuId
          };
        }
      });
    }
    
    showToastMessage(`已移动 ${count} 个卡片！`);
    
    // 清空选中列表
    selectedCards.value = [];
    showMovePanel.value = false;
  } catch (error) {
    showToastMessage(`移动失败：${error.response?.data?.error || error.message}`);
  }
}

// 卡片重新排序处理（拖拽完成后自动保存）
async function handleCardsReordered(cardIds, targetMenuId, targetSubMenuId) {
  // 自动保存，包含分类信息
  const updates = cardIds.map((cardId, index) => ({
    id: cardId,
    order: index,
    menu_id: targetMenuId,
    sub_menu_id: targetSubMenuId
  }));
  
  try {
    await batchUpdateCards(updates);
    // 静默保存，不弹出提示
    // 更新缓存的卡片数据
    if (editMode.value) {
      await loadAllCards();
    } else {
      await loadCards();
    }
  } catch (error) {
    alert('保存失败：' + (error.response?.data?.error || error.message));
    // 保存失败时重新加载，恢复原始顺序
    if (editMode.value) {
      await loadAllCards();
    } else {
      await loadCards();
    }
  }
}

// 删除卡片
async function handleDeleteCard(card) {
  if (!confirm(`确定要删除「${card.title}」吗？`)) return;
  try {
    await deleteCard(card.id);
    
    // 立即从当前显示的卡片列表中移除
    const index = cards.value.findIndex(c => c.id === card.id);
    if (index > -1) {
      cards.value.splice(index, 1);
    }
    
    // 同时更新搜索用的所有卡片列表
    const allIndex = allCards.value.findIndex(c => c.id === card.id);
    if (allIndex > -1) {
      allCards.value.splice(allIndex, 1);
    }
    
    // 如果有选中的卡片，也要移除
    const selectedIndex = selectedCards.value.findIndex(c => c.id === card.id);
    if (selectedIndex > -1) {
      selectedCards.value.splice(selectedIndex, 1);
    }
    
    showToastMessage('删除成功');
  } catch (error) {
    alert('删除失败：' + (error.response?.data?.error || error.message));
  }
}

// 编辑卡片
function handleEditCard(card) {
  editingCard.value = card;
  cardEditForm.value = {
    title: card.title || '',
    url: card.url || '',
    logo_url: card.logo_url || '',
    desc: card.desc || '',
    tagIds: card.tags ? card.tags.map(t => t.id) : []
  };
  editError.value = '';
  showEditCardModal.value = true;
}

// 关闭卡片编辑模态框
function closeEditCardModal() {
  showEditCardModal.value = false;
  editingCard.value = null;
  cardEditForm.value = {
    title: '',
    url: '',
    logo_url: '',
    desc: '',
    tagIds: []
  };
  editError.value = '';
}

// 标签相关辅助方法
function getTagById(tagId) {
  return allTags.value.find(t => t.id === tagId);
}

function addTag(tagId) {
  if (!cardEditForm.value.tagIds.includes(tagId)) {
    cardEditForm.value.tagIds.push(tagId);
  }
}

function removeTag(tagId) {
  const index = cardEditForm.value.tagIds.indexOf(tagId);
  if (index > -1) {
    cardEditForm.value.tagIds.splice(index, 1);
  }
}

const availableTagsForEdit = computed(() => {
  return allTags.value.filter(tag => !cardEditForm.value.tagIds.includes(tag.id));
});

// 保存卡片编辑
async function saveCardEdit() {
  if (!cardEditForm.value.title.trim()) {
    editError.value = '请输入标题';
    return;
  }
  if (!cardEditForm.value.url.trim()) {
    editError.value = '请输入网址';
    return;
  }
  
  editLoading.value = true;
  editError.value = '';
  
  try {
    await updateCard(editingCard.value.id, {
      ...editingCard.value,
      title: cardEditForm.value.title,
      url: cardEditForm.value.url,
      logo_url: cardEditForm.value.logo_url,
      desc: cardEditForm.value.desc,
      tagIds: cardEditForm.value.tagIds
    });
    
    // 立即更新当前显示的卡片列表
    const updatedTags = cardEditForm.value.tagIds.map(id => allTags.value.find(t => t.id === id)).filter(Boolean);
    const index = cards.value.findIndex(c => c.id === editingCard.value.id);
    if (index > -1) {
      cards.value[index] = {
        ...cards.value[index],
        title: cardEditForm.value.title,
        url: cardEditForm.value.url,
        logo_url: cardEditForm.value.logo_url,
        desc: cardEditForm.value.desc,
        tags: updatedTags
      };
    }
    
    // 同时更新搜索用的所有卡片列表
    const allIndex = allCards.value.findIndex(c => c.id === editingCard.value.id);
    if (allIndex > -1) {
      allCards.value[allIndex] = {
        ...allCards.value[allIndex],
        title: cardEditForm.value.title,
        url: cardEditForm.value.url,
        logo_url: cardEditForm.value.logo_url,
        desc: cardEditForm.value.desc,
        tags: updatedTags
      };
    }
    
    // 如果卡片在选中列表中，也要更新
    const selectedIndex = selectedCards.value.findIndex(c => c.id === editingCard.value.id);
    if (selectedIndex > -1) {
      selectedCards.value[selectedIndex] = {
        ...selectedCards.value[selectedIndex],
        title: cardEditForm.value.title,
        url: cardEditForm.value.url,
        logo_url: cardEditForm.value.logo_url,
        desc: cardEditForm.value.desc,
        tags: updatedTags
      };
    }
    
    showToastMessage('修改成功');
    closeEditCardModal();
  } catch (error) {
    editError.value = '修改失败：' + (error.response?.data?.error || error.message);
  } finally {
    editLoading.value = false;
  }
}
</script>

<style scoped>
.menu-bar-fixed {
  position: fixed;
  top: .6rem;
  left: 0;
  width: 100vw;
  z-index: 200;
  /* background: rgba(0,0,0,0.6); /* 可根据需要调整 */
  /* backdrop-filter: blur(8px);  /*  毛玻璃效果 */
}

/* 搜索引擎下拉选择器 */
.search-engine-dropdown {
  position: relative;
  margin-right: 8px;
}

.engine-selector {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(102, 126, 234, 0.1);
  border: 1px solid rgba(102, 126, 234, 0.2);
  border-radius: 8px;
  padding: 8px 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.engine-selector:hover {
  background: rgba(102, 126, 234, 0.15);
  border-color: rgba(102, 126, 234, 0.3);
}

.engine-selector .engine-icon {
  font-size: 1.2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.engine-icon-img {
  width: 20px;
  height: 20px;
  object-fit: contain;
}


.engine-dropdown-menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  min-width: 200px;
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  z-index: 10001;
  overflow: hidden;
}

.engine-menu-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-weight: 600;
  font-size: 14px;
}

.add-engine-icon-btn {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.add-engine-icon-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: scale(1.1);
}

.engine-menu-items {
  max-height: 300px;
  overflow-y: auto;
}

.engine-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 16px;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
  color: #333;
}

.engine-menu-item:hover {
  background: rgba(102, 126, 234, 0.1);
}

.engine-menu-item.active {
  background: rgba(102, 126, 234, 0.15);
  color: #667eea;
  font-weight: 600;
}

.engine-menu-item .engine-icon {
  font-size: 1.2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
}


.engine-menu-item .engine-label {
  flex: 1;
}

.delete-engine-btn-small {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(239, 68, 68, 0.1);
  border: none;
  color: #ef4444;
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.delete-engine-btn-small:hover {
  background: #ef4444;
  color: white;
  transform: scale(1.1);
}

/* 下拉菜单动画 */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.2s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.search-container {
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 25px;
  padding: 0.4rem 0.6rem;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  backdrop-filter: blur(10px);
  max-width: 640px;
  width: 92%;
  position: relative;
  z-index: 10;
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  padding: .2rem .8rem;
  font-size: 1.1rem;
  color: #333;
  outline: none;
}

.search-input::placeholder {
  color: #999;
}

.clear-btn {
  background: none;
  border: none;
  outline: none;
  cursor: pointer;
  margin-right: 0.3rem;
  display: flex;
  align-items: center;
  padding: 4px;
  border-radius: 50%;
  transition: all 0.2s;
}

.clear-btn svg {
  stroke: #666;
}

.clear-btn:hover {
  background: rgba(0, 0, 0, 0.05);
}

.search-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #ffffff;
  border: none;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
}

.search-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.5);
}

.home-container {
  min-height: 95vh;
  background-image: url('https://main.ssss.nyc.mn/background.webp');
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  background-attachment: fixed;
  display: flex;
  flex-direction: column;
  /* padding: 1rem 1rem; */
  position: relative;
  padding-top: 50px; 
}

.home-container::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 1;
}

.search-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 1.5rem 0 0 0;
  position: relative;
  z-index: 50;
  margin-top: 12vh;
}

.search-box-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 640px;
}

/* 迷你标签栏 */
.mini-tag-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0.5rem 1rem;
  position: relative;
  z-index: 2;
}

.selected-tag-display {
  display: flex;
  align-items: center;
  gap: 6px;
}

.mini-tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 16px;
  font-size: 13px;
  color: white;
  font-weight: 500;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

.mini-tag-close {
  background: none;
  border: none;
  color: white;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.8;
  transition: opacity 0.2s;
}

.mini-tag-close:hover {
  opacity: 1;
}

.mini-tag-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  background: rgba(255, 255, 255, 0.9);
  border: 1.5px solid rgba(102, 126, 234, 0.3);
  border-radius: 16px;
  font-size: 12px;
  color: #667eea;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
}

.mini-tag-btn:hover {
  background: #667eea;
  color: white;
  border-color: #667eea;
  transform: translateY(-1px);
  box-shadow: 0 3px 8px rgba(102, 126, 234, 0.3);
}

.tag-count {
  background: rgba(102, 126, 234, 0.1);
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 600;
  font-size: 11px;
}

.mini-tag-btn:hover .tag-count {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

/* 标签选择浮层 */
.tag-panel-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  z-index: 1000;
  padding-top: 15vh;
}

.tag-panel {
  background: white;
  border-radius: 16px;
  width: 90%;
  max-width: 600px;
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.tag-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #e5e7eb;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.tag-panel-header h4 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: white;
}

.panel-close-btn {
  background: none;
  border: none;
  font-size: 28px;
  color: white;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s;
  line-height: 1;
}

.panel-close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.tag-panel-content {
  padding: 20px;
  overflow-y: auto;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-content: flex-start;
}

.panel-tag-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 2px solid;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
  backdrop-filter: blur(5px);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
}

.panel-tag-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.panel-tag-btn.active {
  transform: scale(1.05);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

/* 浮层动画 */
.tag-panel-enter-active,
.tag-panel-leave-active {
  transition: all 0.3s ease;
}

.tag-panel-enter-from {
  opacity: 0;
}

.tag-panel-leave-to {
  opacity: 0;
}

.tag-panel-enter-from .tag-panel,
.tag-panel-leave-to .tag-panel {
  transform: translateY(-20px) scale(0.95);
}

.content-wrapper {
  display: flex;
  max-width: 1400px;
  margin: 0 auto;
  gap: 2rem;
  position: relative;
  z-index: 2;
  flex: 1;
  justify-content: space-between;
}

.main-content {
  flex: 1;
  min-width: 0;
}

.ad-space {
  width: 90px;
  min-width: 60px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  padding: 0;
  background: transparent;
  margin: 0;
}
.ad-space a {
  width: 100%;
  display: block;
}
.ad-space img {
  width: 100%;
  max-width: 90px;
  max-height: 160px;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.12);
  background: #fff;
  object-fit: contain;
  margin: 0 auto;
}

.ad-placeholder {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border: 2px dashed rgba(255, 255, 255, 0.3);
  border-radius: 12px;
  color: rgba(255, 255, 255, 0.6);
  padding: 2rem 1rem;
  text-align: center;
  font-size: 14px;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.footer {
  margin-top: auto;
  text-align: center;
  padding-top: 1rem;
  padding-bottom: 2rem;
  position: relative;
  z-index: 2;
}

.footer-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 50px;
}

.friend-link-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 14px;
  padding: 0;
}

.friend-link-btn:hover {
  color: #1976d2;
  transform: translateY(-1px);
}

/* 弹窗样式 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(5px);
}

.modal-content {
  background: #8585859c;
  border-radius: 16px;
  width: 55rem;
  height: 30rem;
  max-width: 95vw;
  max-height: 95vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  border-bottom: 1px solid #e5e7eb;
  background: #d3d6d8;
}

.modal-header h3 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: #111827;
}

.close-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
  border-radius: 8px;
  color: #6b7280;
  transition: all 0.2s;
}

.close-btn:hover {
  background: #f3f4f6;
  color: #cf1313;
}

.modal-body {
  flex: 1;
  padding: 32px;
  overflow-y: auto;
}

.friend-links-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 12px;
}
@media (max-width: 768px) {
  .friend-links-grid {
    grid-template-columns: repeat(3, 1fr);
  }

  .container {
    width: 95%;
  }
}

.friend-link-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px;
  background: #cfd3d661;
  border-radius: 15px;
  text-decoration: none;
  color: inherit;
  transition: all 0.2s ease;
  border: 1px solid #cfd3d661;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.friend-link-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0,0,0,0.08);
  background: #ffffff8e;
}

.friend-link-logo {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}

.friend-link-logo img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.friend-link-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e5e7eb;
  color: #6b7280;
  font-size: 18px;
  font-weight: 600;
  border-radius: 8px;
}

.friend-link-info h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  text-align: center;
  line-height: 1.3;
  word-break: break-all;
}

.copyright {
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
  margin: 0;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}
.footer-link {
  color: #ffffffcc;
  text-decoration: none;
  transition: color 0.2s;
}
.footer-link:hover {
  color: #1976d2;
}

:deep(.menu-bar) {
  position: relative;
  z-index: 2;
}

:deep(.card-grid) {
  position: relative;
  z-index: 2;
}

.ad-space-fixed {
  position: fixed;
  top: 13rem;
  z-index: 10;
  width: 90px;
  min-width: 60px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 0;
  background: transparent;
  margin: 0;
}
.left-ad-fixed {
  left: 0;
}
.right-ad-fixed {
  right: 0;
}
.ad-space-fixed a {
  width: 100%;
  display: block;
}
.ad-space-fixed img {
  width: 100%;
  max-width: 90px;
  max-height: 160px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.12);
  background: #fff;
  margin: 0 auto;
}

@media (max-width: 1200px) {
  .content-wrapper {
    flex-direction: column;
    gap: 1rem;
  }
  
  .ad-space {
    width: 100%;
    height: 100px;
  }
  
  .ad-placeholder {
    height: 80px;
  }
}

@media (max-width: 768px) {
  .home-container {
    padding-top: 80px;
  }
  
  .content-wrapper {
    gap: 0.5rem;
  }
  
  .ad-space {
    height: 60px;
  }
  
  .ad-placeholder {
    height: 50px;
    font-size: 12px;
    padding: 1rem 0.5rem;
  }
  .footer {
    padding-top: 2rem;
  }
  .friend-link-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.8);
    cursor: pointer;
    transition: all 0.3s ease;
    font-size: 0.7rem;
    padding: 0;
  }
  .copyright {
    color: rgba(255, 255, 255, 0.8);
    font-size: 0.7rem;
    margin: 0;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  }
  .footer-content {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 20px;
  }
}

/* 浮动操作按钮 */
.fab-container {
  position: fixed;
  right: 30px;
  bottom: 30px;
  z-index: 999;
  display: flex;
  flex-direction: column-reverse;
  align-items: center;
}

.fab-toggle-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea, #764ba2);
  border: none;
  color: white;
  cursor: pointer;
  box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.fab-toggle-btn:hover {
  transform: scale(1.1) rotate(90deg);
  box-shadow: 0 6px 30px rgba(102, 126, 234, 0.6);
}

.batch-add-btn,
.change-bg-btn {
  /* Common styles for FAB items */
  position: relative;
  width: 37px;
  height: 37px;
  margin-bottom: 10px;
  border-radius: 50%;
  border: none;
  color: white;
  cursor: pointer;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
}

.batch-add-btn {
  background: linear-gradient(135deg, #89f7fe, #66a6ff);
}

.change-bg-btn {
  background: linear-gradient(135deg, #34a853, #0f9d58);
}

.batch-add-btn:hover,
.change-bg-btn:hover:not(:disabled) {
  transform: scale(1.1);
  box-shadow: 0 6px 25px rgba(0, 0, 0, 0.3);
}

.change-bg-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.change-bg-btn:disabled svg {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Transitions for FAB items */
.fab-item-enter-active,
.fab-item-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.fab-item-enter-from,
.fab-item-leave-to {
  opacity: 0;
  transform: translateY(30px) scale(0.9);
}

/* Transitions for the icon inside toggle button */
.fab-icon-enter-active,
.fab-icon-leave-active {
  transition: all 0.2s ease-in-out;
  position: absolute;
}
.fab-icon-enter-from {
  transform: rotate(-135deg);
  opacity: 0;
}
.fab-icon-leave-to {
  transform: rotate(135deg);
  opacity: 0;
}

/* 批量添加弹窗 */
.batch-modal {
  width: 700px;
  max-height: 80vh;
}

.batch-step {
  min-height: 300px;
}

.batch-tip {
  font-size: 16px;
  color: #374151;
  margin-bottom: 16px;
}

.batch-input,
.batch-textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  margin-bottom: 16px;
  box-sizing: border-box;
}

.batch-textarea {
  resize: vertical;
  font-family: 'Courier New', monospace;
  line-height: 1.6;
}

.batch-input:focus,
.batch-textarea:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.batch-error {
  color: #dc2626;
  font-size: 14px;
  margin-bottom: 16px;
}

.batch-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

/* 卡片编辑表单 */
.edit-card-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  font-size: 14px;
  font-weight: 500;
  color: #374151;
}

/* 标签选择区域 */
.tag-select-area {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.selected-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 36px;
  padding: 8px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.selected-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 13px;
  color: white;
  font-weight: 500;
}

.remove-tag-btn {
  background: none;
  border: none;
  color: white;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.8;
  transition: opacity 0.2s;
}

.remove-tag-btn:hover {
  opacity: 1;
}

.available-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.available-tag-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: white;
  border: 1.5px solid;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.available-tag-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
}

.btn {
  padding: 10px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn-cancel {
  background: #f3f4f6;
  color: #374151;
}

.btn-cancel:hover {
  background: #e5e7eb;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 预览列表 */
.batch-preview-list {
  max-height: 400px;
  overflow-y: auto;
  margin-bottom: 16px;
}

.batch-preview-item {
  display: flex;
  align-items: flex-start;
  margin-bottom: 12px;
  gap: 12px;
}

.batch-preview-item input[type="checkbox"] {
  margin-top: 8px;
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.batch-card-preview {
  flex: 1;
  display: flex;
  gap: 12px;
  padding: 12px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.batch-card-preview:hover {
  background: #f3f4f6;
  border-color: #667eea;
}

.batch-card-logo {
  width: 48px;
  height: 48px;
  border-radius: 6px;
  object-fit: contain;
  background: white;
  padding: 4px;
  border: 1px solid #e5e7eb;
}

.batch-card-info {
  flex: 1;
  min-width: 0;
}

.batch-card-title {
  font-size: 16px;
  font-weight: 600;
  color: #111827;
  margin: 0 0 4px 0;
  word-break: break-word;
}

.batch-card-url {
  font-size: 13px;
  color: #6b7280;
  margin: 0 0 6px 0;
  word-break: break-all;
}

.batch-card-desc {
  font-size: 13px;
  color: #9ca3af;
  margin: 0;
  line-height: 1.4;
}

.batch-card-warning {
  font-size: 12px;
  color: #dc2626;
  margin: 4px 0 0 0;
}

/* 可编辑字段样式 */
.batch-edit-field {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.batch-edit-field label {
  font-size: 13px;
  color: #6b7280;
  min-width: 50px;
  font-weight: 500;
}

.batch-edit-input,
.batch-edit-textarea {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  background: white;
  transition: all 0.2s;
}

.batch-edit-input:focus,
.batch-edit-textarea:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.1);
}

.batch-edit-textarea {
  resize: vertical;
  min-height: 40px;
  font-family: inherit;
  line-height: 1.4;
}

/* 批量标签选择器 */
.batch-tags-selector {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 10px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  max-height: 180px;
  overflow-y: auto;
}

/* 推荐标签区域 */
.recommended-tags-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.recommended-tags-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.recommend-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  color: #f59e0b;
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  padding: 3px 10px;
  border-radius: 12px;
  border: 1px solid #fbbf24;
}

.recommended-tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* 其他标签区域 */
.other-tags-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid #e5e7eb;
}

.other-tags-header {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
}

.other-tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.batch-tag-option {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.batch-tag-option.recommended {
  animation: pulse 2s ease-in-out;
}

@keyframes pulse {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
}

.batch-tag-option input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: #667eea;
}

.batch-tag-label {
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  color: white;
  font-weight: 500;
  transition: all 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.batch-tag-option:hover .batch-tag-label {
  opacity: 0.85;
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
}

.batch-tag-option.recommended .batch-tag-label {
  box-shadow: 0 2px 6px rgba(245, 158, 11, 0.3);
}

/* 记住密码复选框 */
.remember-password-wrapper {
  margin-bottom: 16px;
}

.remember-password-wrapper label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
  color: #374151;
}

.remember-password-wrapper input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

@media (max-width: 768px) {
  .batch-modal {
    width: 95vw;
  }
}

/* ========== 编辑模式按钮样式 ==========  */

.edit-mode-btn,
.exit-edit-btn {
  width: 33px;
  height: 33px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
  transition: all 0.3s ease;
  margin-bottom: 10px;
}

.edit-mode-btn:hover,
.exit-edit-btn:hover {
  transform: scale(1.1);
  box-shadow: 0 6px 25px rgba(102, 126, 234, 0.3);
}

.exit-edit-btn {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  box-shadow: 0 4px 15px rgba(239, 68, 68, 0.4);
}

.exit-edit-btn:hover {
  box-shadow: 0 6px 25px rgba(239, 68, 68, 0.3);
}

.batch-move-btn {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);
  transition: all 0.3s ease;
  margin-bottom: 15px;
  position: relative;
}

.batch-move-btn:hover {
  transform: scale(1.1);
  box-shadow: 0 6px 25px rgba(16, 185, 129, 0.3);
}

.batch-count {
  position: absolute;
  top: -5px;
  right: -5px;
  background: #ef4444;
  color: white;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}

/* ========== Toast 提示样式 ========== */

.move-target-panel {
  position: fixed;
  top: 50%;
  right: 20px;
  transform: translateY(-50%);
  width: 280px;
  max-height: 80vh;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 15px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  overflow: hidden;
  animation: slideInRight 0.3s ease;
}

@keyframes slideInRight {
  from {
    opacity: 0;
    transform: translateY(-50%) translateX(20px);
  }
  to {
    opacity: 1;
    transform: translateY(-50%) translateX(0);
  }
}

.move-target-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.move-target-header h4 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.cancel-move-btn {
  background: none;
  border: none;
  color: white;
  font-size: 24px;
  cursor: pointer;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background 0.2s;
}

.cancel-move-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.move-target-list {
  max-height: calc(80vh - 60px);
  overflow-y: auto;
  padding: 10px;
}

.target-menu-group {
  margin-bottom: 10px;
}

.target-menu-btn,
.target-submenu-btn {
  width: 100%;
  text-align: left;
  padding: 12px 15px;
  border: 2px solid transparent;
  background: #f3f4f6;
  color: #374151;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 5px;
}

.target-menu-btn:hover,
.target-submenu-btn:hover {
  background: #e5e7eb;
  border-color: #667eea;
}

.target-menu-btn.active,
.target-submenu-btn.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-color: #667eea;
}

.target-submenu-list {
  margin-left: 15px;
  margin-top: 5px;
}

.target-submenu-btn {
  font-size: 13px;
  padding: 10px 12px;
  background: #ffffff;
}

@media (max-width: 768px) {
  .move-target-panel {
    right: 10px;
    left: 10px;
    width: auto;
    max-width: 90vw;
  }
}

/* ========== Toast 提示样式 ========== */

.toast-notification {
  position: fixed;
  top: 80px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.85);
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  z-index: 10000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
  pointer-events: none;
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(-20px);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-20px);
}

/* ========== 编辑模式分类视图样式 ========== */

.categories-view {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  position: relative;
  z-index: 2;
}

.category-section {
  margin-bottom: 40px;
  padding: 20px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 15px;
  backdrop-filter: blur(10px);
  border: 2px solid rgba(255, 255, 255, 0.2);
}

.category-title {
  color: #fff;
  font-size: 24px;
  font-weight: bold;
  margin: 0 0 20px 0;
  padding-bottom: 10px;
  border-bottom: 2px solid rgba(255, 255, 255, 0.3);
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
}

.sub-categories {
  margin-top: 20px;
}

.sub-category-section {
  margin-top: 20px;
  padding: 15px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  border: 1px dashed rgba(255, 255, 255, 0.3);
}

.sub-category-title {
  color: #fff;
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 15px 0;
  text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.3);
}

/* 空分类提示 */
.category-section:has(.card-grid:empty)::after,
.sub-category-section:has(.card-grid:empty)::after {
  content: '拖动卡片到此处';
  display: block;
  text-align: center;
  padding: 30px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
  border: 2px dashed rgba(255, 255, 255, 0.3);
  border-radius: 8px;
  margin-top: 10px;
}

@media (max-width: 768px) {
  .categories-view {
    padding: 15px;
  }
  
  .category-section {
    padding: 15px;
    margin-bottom: 30px;
  }
  
  .category-title {
    font-size: 20px;
  }
  
  .sub-category-title {
    font-size: 16px;
  }
}
</style>
