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
                  <div v-for="(engine, index) in searchEngines" :key="engine.name" class="engine-menu-row">
                    <button
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
                    </button>
                    <div class="engine-actions">
                      <button v-if="index > 0" @click.stop="moveEngineUp(index)" class="engine-sort-btn" title="上移">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 15l-6-6-6 6"/></svg>
                      </button>
                      <button v-if="index < searchEngines.length - 1" @click.stop="moveEngineDown(index)" class="engine-sort-btn" title="下移">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
                      </button>
                      <button v-if="engine.custom" @click.stop="deleteCustomEngine(engine)" class="delete-engine-btn-small" title="删除">×</button>
                    </div>
                  </div>
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
    <div class="mini-tag-bar">
      <!-- 已选标签显示（支持多标签） -->
      <div class="selected-tag-display" v-if="selectedTagIds.length > 0">
        <span 
          v-for="tagId in selectedTagIds" 
          :key="tagId"
          class="mini-tag-chip" 
          :style="{ backgroundColor: getTagById(tagId)?.color }"
        >
          {{ getTagById(tagId)?.name }}
          <button class="mini-tag-close" @click="toggleTagFilter(tagId)" title="移除此标签">×</button>
        </span>
        <button v-if="selectedTagIds.length > 1" class="mini-tag-clear-all" @click="clearTagFilter" title="清除全部">
          清除
        </button>
      </div>
      <!-- 标签选择按钮 -->
      <button v-if="allTags.length > 0" class="mini-tag-btn" @click="showTagPanel = !showTagPanel" :title="showTagPanel ? '关闭标签' : '选择标签'">
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
            <h4>选择标签 <span v-if="selectedTagIds.length > 0" class="selected-count">(已选 {{ selectedTagIds.length }})</span></h4>
            <button class="panel-close-btn" @click="showTagPanel = false">×</button>
          </div>
          <div class="tag-panel-content">
            <button 
              v-for="tag in allTags" 
              :key="tag.id" 
              class="panel-tag-btn"
              :class="{ active: isTagSelected(tag.id) }"
              :style="{ 
                backgroundColor: isTagSelected(tag.id) ? tag.color : 'rgba(255,255,255,0.9)',
                color: isTagSelected(tag.id) ? 'white' : tag.color,
                borderColor: tag.color
              }"
              @click="toggleTagFilter(tag.id)"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                <line x1="7" y1="7" x2="7.01" y2="7"/>
              </svg>
              {{ tag.name }}
              <span v-if="isTagSelected(tag.id)" class="tag-check">✓</span>
            </button>
          </div>
          <div v-if="selectedTagIds.length > 0" class="tag-panel-footer">
            <button class="clear-all-btn" @click="clearTagFilter">清除全部</button>
          </div>
        </div>
      </div>
    </transition>
    
    <!-- 左侧宣传条 -->
    <div v-if="leftPromos.length" class="promo-space-fixed left-promo-fixed">
      <a v-for="item in leftPromos" :key="item.id" :href="item.url" target="_blank">
        <img :src="item.img" alt="宣传" loading="lazy" />
      </a>
    </div>
    <!-- 右侧宣传条 -->
    <div v-if="rightPromos.length" class="promo-space-fixed right-promo-fixed">
      <a v-for="item in rightPromos" :key="item.id" :href="item.url" target="_blank">
        <img :src="item.img" alt="宣传" loading="lazy" />
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
              ⤷ {{ subMenu.name }}
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 直接显示卡片，无骨架屏 -->
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
              <div v-for="(item, index) in parsedCards" :key="index" class="batch-preview-item" :class="{ 'is-duplicate': item.isDuplicate }">
                <input type="checkbox" v-model="item.selected" :id="`card-${index}`" />
                <div class="batch-card-preview">
                  <!-- 重复标记徽章 -->
                  <div v-if="item.isDuplicate" class="duplicate-badge">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                      <line x1="12" y1="9" x2="12" y2="13"></line>
                      <line x1="12" y1="17" x2="12.01" y2="17"></line>
                    </svg>
                    <span>重复</span>
                  </div>
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
                            <span class="recommend-badge">⭐ 智能推荐</span>
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
                    <p v-if="!item.success" class="batch-card-warning">⚠️ {{ item.error }}</p>
                    <!-- 重复提示信息 -->
                    <p v-if="item.isDuplicate && item.duplicateOf" class="batch-card-duplicate-info">
                      ⚠️ 与已存在的卡片重复：<strong>{{ item.duplicateOf.title }}</strong>
                    </p>
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
        <p class="copyright">Copyright © 2025 Con-Nav-Item | <a href="https://github.com/zczy-k/Con-Nav-Item" target="_blank" class="footer-link">Powered by zczy-k</a></p>
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
                  :src="getFriendLogo(friend)" 
                  :alt="friend.title"
                  loading="lazy"
                  @error="handleFriendLogoError($event, friend)"
                />
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
                <!-- 标签搜索框 -->
                <div class="tag-search-row">
                  <input 
                    v-model="tagSearchQuery" 
                    type="text" 
                    placeholder="搜索标签..." 
                    class="tag-search-input"
                  />
                  <button @click="showQuickAddTag = !showQuickAddTag" class="quick-add-tag-btn" :title="showQuickAddTag ? '取消' : '新建标签'">
                    {{ showQuickAddTag ? '×' : '+ 新建' }}
                  </button>
                </div>
                <!-- 快速新建标签 -->
                <div v-if="showQuickAddTag" class="quick-add-tag-form">
                  <input 
                    v-model="quickTagName" 
                    type="text" 
                    placeholder="标签名称" 
                    class="quick-tag-name-input"
                    maxlength="20"
                  />
                  <input 
                    v-model="quickTagColor" 
                    type="color" 
                    class="quick-tag-color-input"
                    title="选择颜色"
                  />
                  <button @click="createQuickTag" class="quick-tag-create-btn" :disabled="!quickTagName.trim()">
                    创建
                  </button>
                </div>
                <div class="available-tags">
                  <button 
                    v-for="tag in filteredAvailableTags" 
                    :key="tag.id"
                    @click="addTag(tag.id)"
                    class="available-tag-btn"
                    :style="{ borderColor: tag.color, color: tag.color }"
                  >
                    + {{ tag.name }}
                  </button>
                  <span v-if="filteredAvailableTags.length === 0 && tagSearchQuery" class="no-tags-hint">
                    未找到匹配的标签
                  </span>
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
import { getMenus, getCards, getAllCards, getPromos, getFriends, verifyPassword, batchParseUrls, batchAddCards, getRandomWallpaper, batchUpdateCards, deleteCard, updateCard, getSearchEngines, parseSearchEngine, addSearchEngine, deleteSearchEngine, getTags } from '../api';
import MenuBar from '../components/MenuBar.vue';
import { filterCardsWithPinyin } from '../utils/pinyin';
import { isDuplicateCard } from '../utils/urlNormalizer';
const CardGrid = defineAsyncComponent(() => import('../components/CardGrid.vue'));

const menus = ref([]);
const activeMenu = ref(null);
const activeSubMenu = ref(null);
const cards = ref([]);
const cardsLoading = ref(false); // 禁用骨架屏
const allCards = ref([]); // 存储所有菜单的卡片，用于搜索
const searchQuery = ref('');
const leftPromos = ref([]);
const rightPromos = ref([]);
const showFriendLinks = ref(false);
const friendLinks = ref([]);
const allTags = ref([]);
const selectedTagIds = ref([]); // 支持多标签筛选
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

// 标签搜索和快速创建
const tagSearchQuery = ref('');
const showQuickAddTag = ref(false);
const quickTagName = ref('');
const quickTagColor = ref('#1890ff');

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
  // 优先
  {
    name: 'bing',
    label: 'Bing',
    url: q => `https://www.bing.com/search?q=${encodeURIComponent(q)}`
  },
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
  // 国内
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
  // 其他
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

// 初始化时立即设置默认搜索引擎，避免搜索框延迟显示
const searchEngines = ref([...defaultEngines]);
const selectedEngine = ref(defaultEngines[0]);

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

// 保存搜索引擎顺序到localStorage
function saveEngineOrder() {
  try {
    const order = searchEngines.value.map(e => e.name);
    localStorage.setItem('search_engine_order', JSON.stringify(order));
  } catch (e) {
    console.error('保存搜索引擎顺序失败:', e);
  }
}

// 上移搜索引擎
function moveEngineUp(index) {
  if (index <= 0) return;
  const engines = [...searchEngines.value];
  [engines[index - 1], engines[index]] = [engines[index], engines[index - 1]];
  searchEngines.value = engines;
  saveEngineOrder();
}

// 下移搜索引擎
function moveEngineDown(index) {
  if (index >= searchEngines.value.length - 1) return;
  const engines = [...searchEngines.value];
  [engines[index], engines[index + 1]] = [engines[index + 1], engines[index]];
  searchEngines.value = engines;
  saveEngineOrder();
}

function clearSearch() {
  searchQuery.value = '';
}

// 标签筛选控制（支持多标签）
function toggleTagFilter(tagId) {
  const index = selectedTagIds.value.indexOf(tagId);
  if (index > -1) {
    selectedTagIds.value.splice(index, 1);
  } else {
    selectedTagIds.value.push(tagId);
  }
}

function clearTagFilter() {
  selectedTagIds.value = [];
}

// 检查标签是否被选中
function isTagSelected(tagId) {
  return selectedTagIds.value.includes(tagId);
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
      icon: '🔎',
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
  // 当有搜索关键词时，从所有卡片中搜索；否则只显示当前菜单的卡片
  let result = searchQuery.value ? allCards.value : cards.value;
  
  // 先应用标签筛选（多标签：卡片需包含所有选中的标签）
  if (selectedTagIds.value.length > 0) {
    result = result.filter(card => 
      card.tags && selectedTagIds.value.every(tagId => 
        card.tags.some(tag => tag.id === tagId)
      )
    );
  }
  
  // 再应用搜索筛选（支持拼音搜索）
  if (searchQuery.value) {
    result = filterCardsWithPinyin(result, searchQuery.value);
  }
  
  return result;
});

// 背景版本号 - 修改此值会清除用户保存的背景，显示新的默认背景
const BG_VERSION = '3.0';

// 在组件渲染前应用保存的背景，避免闪烁
onBeforeMount(() => {
  // 检查背景版本，如果版本不匹配则清除旧背景
  const savedBgVersion = localStorage.getItem('nav_background_version');
  if (savedBgVersion !== BG_VERSION) {
    localStorage.removeItem('nav_background');
    localStorage.setItem('nav_background_version', BG_VERSION);
  }
  
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
  // ========== 优化：先加载缓存数据实现秒开 ==========
  const CACHE_KEY = 'nav_data_cache';
  const CARDS_CACHE_KEY = 'nav_cards_cache'; // 分类卡片缓存
  const CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存有效期
  
  // 尝试从缓存加载数据
  let cacheUsed = false;
  let cachedCardsMap = {}; // 缓存的分类卡片映射
  
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      
      // 立即使用缓存数据渲染（即使过期也先显示）
      if (data.menus?.length) {
        menus.value = data.menus;
        activeMenu.value = menus.value[0];
        cacheUsed = true;
      }
      if (data.cards) {
        cards.value = data.cards;
      }
      if (data.tags) {
        allTags.value = data.tags;
      }
      if (data.promos) {
        leftPromos.value = data.promos.filter(item => item.position === 'left');
        rightPromos.value = data.promos.filter(item => item.position === 'right');
      }
      if (data.friends) {
        friendLinks.value = data.friends;
      }
      if (data.engines) {
        const customEngines = data.engines.map(engine => ({
          name: 'custom_' + engine.id,
          label: engine.name,
          iconUrl: null,
          iconFallback: '🔎',
          placeholder: `${engine.name} 搜索...`,
          url: q => engine.search_url.replace('{searchTerms}', encodeURIComponent(q)),
          custom: true,
          id: engine.id,
          keyword: engine.keyword
        }));
        searchEngines.value = [...defaultEngines, ...customEngines];
      }
      
      // 恢复用户保存的搜索引擎顺序
      const savedOrder = localStorage.getItem('search_engine_order');
      if (savedOrder) {
        try {
          const order = JSON.parse(savedOrder);
          const engineMap = new Map(searchEngines.value.map(e => [e.name, e]));
          const sorted = [];
          // 按保存的顺序排列
          order.forEach(name => {
            if (engineMap.has(name)) {
              sorted.push(engineMap.get(name));
              engineMap.delete(name);
            }
          });
          // 新增的引擎放到末尾
          engineMap.forEach(e => sorted.push(e));
          if (sorted.length > 0) {
            searchEngines.value = sorted;
          }
        } catch (e) {
          // 解析失败忽略
        }
      }
      
      // 从缓存恢复用户选择的搜索引擎
      const savedEngineName = localStorage.getItem('default_search_engine');
      if (savedEngineName) {
        const foundEngine = searchEngines.value.find(e => e.name === savedEngineName);
        if (foundEngine) {
          selectedEngine.value = foundEngine;
        }
      }
    }
    
    // 加载分类卡片缓存到内存
    const cardsCacheStr = localStorage.getItem(CARDS_CACHE_KEY);
    if (cardsCacheStr) {
      const { data: cardsData, timestamp } = JSON.parse(cardsCacheStr);
      if (Date.now() - timestamp < CACHE_TTL) {
        cachedCardsMap = cardsData || {};
        cardsCache.value = cachedCardsMap;
        
        // 如果有首屏分类的缓存，立即显示
        if (menus.value.length > 0) {
          const firstMenuKey = `${menus.value[0].id}_null`;
          if (cachedCardsMap[firstMenuKey]) {
            cards.value = cachedCardsMap[firstMenuKey];
          }
        }
      }
    }
  } catch (e) {
    // 缓存读取失败，忽略
  }
  
  // ========== 后台加载最新数据 ==========
  // 并行加载所有独立数据：菜单、宣传、友链、标签、自定义搜索引擎
  const [menusRes, promosRes, friendsRes, tagsRes, enginesRes] = await Promise.allSettled([
    getMenus(),
    getPromos(),
    getFriends(),
    getTags(),
    getSearchEngines()
  ]);
  
  // 准备缓存数据
  const cacheData = { menus: null, cards: null, tags: null, ads: null, friends: null, engines: null };
  
  // 处理菜单数据（优先级最高）
  if (menusRes.status === 'fulfilled') {
    menus.value = menusRes.value.data;
    cacheData.menus = menusRes.value.data;
    if (menus.value.length) {
      if (!cacheUsed) {
        activeMenu.value = menus.value[0];
      }
      await loadCards();
      cacheData.cards = cards.value;
      // 延迟 1 秒后加载搜索卡片，让首屏更快
      setTimeout(() => {
        loadAllCardsForSearch();
      }, 1000);
    }
  }
  
  // 处理宣传数据
  if (promosRes.status === 'fulfilled') {
    leftPromos.value = promosRes.value.data.filter(item => item.position === 'left');
    rightPromos.value = promosRes.value.data.filter(item => item.position === 'right');
    cacheData.promos = promosRes.value.data;
  }
  
  // 处理友链数据
  if (friendsRes.status === 'fulfilled') {
    friendLinks.value = friendsRes.value.data;
    cacheData.friends = friendsRes.value.data;
  }
  
  // 处理标签数据
  if (tagsRes.status === 'fulfilled') {
    allTags.value = tagsRes.value.data;
    cacheData.tags = tagsRes.value.data;
  } else {
    console.error('加载标签失败:', tagsRes.reason);
  }
  
  // 处理自定义搜索引擎
  if (enginesRes.status === 'fulfilled') {
    const customEngines = enginesRes.value.data.map(engine => ({
      name: 'custom_' + engine.id,
      label: engine.name,
      iconUrl: null,
      iconFallback: '🔎',
      placeholder: `${engine.name} 搜索...`,
      url: q => engine.search_url.replace('{searchTerms}', encodeURIComponent(q)),
      custom: true,
      id: engine.id,
      keyword: engine.keyword
    }));
    searchEngines.value = [...defaultEngines, ...customEngines];
    cacheData.engines = enginesRes.value.data;
  } else {
    console.error('加载自定义搜索引擎失败:', enginesRes.reason);
    searchEngines.value = [...defaultEngines];
  }
  
  // ========== 保存缓存数据 ==========
  try {
    if (cacheData.menus) {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        data: cacheData,
        timestamp: Date.now()
      }));
    }
  } catch (e) {
    // 缓存保存失败，忽略（可能是存储空间不足）
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
  
  // 检查 URL 参数，看是否需要自动打开批量添加
  const urlParams = new URLSearchParams(window.location.search);
  const batchAddParam = urlParams.get('batchAdd');
  const urlsParam = urlParams.get('urls');
  
  if (batchAddParam === 'true' && urlsParam) {
    // 清理 URL 参数，避免刷新时重复执行
    window.history.replaceState({}, document.title, window.location.pathname);
    
    // 稍微延迟一下，确保菜单已经加载
    setTimeout(() => {
      // 自动打开批量添加弹窗
      openBatchAddModal();
      
      // 再等待一下，确保弹窗已打开且已跳过密码验证步骤
      setTimeout(() => {
        // 如果已经在第二步，则自动填充 URLs
        if (batchStep.value === 2) {
          batchUrls.value = decodeURIComponent(urlsParam);
        } else {
          // 如果还在第一步，等待用户验证后填充
          const checkAndFill = setInterval(() => {
            if (batchStep.value === 2) {
              batchUrls.value = decodeURIComponent(urlsParam);
              clearInterval(checkAndFill);
            }
          }, 100);
          
          // 最多等待 30 秒
          setTimeout(() => clearInterval(checkAndFill), 30000);
        }
      }, 300);
    }, 500);
  }
  
  document.addEventListener('click', closeFabMenu);
  document.addEventListener('click', closeEngineDropdown);
});


// 页面可见性变化时刷新数据（用户从其他标签页切换回来时）
let lastVisibilityTime = Date.now();
let lastRefreshTime = 0;
let isRefreshing = false;
const MIN_REFRESH_INTERVAL = 10000; // 最小刷新间隔10秒，防止频繁刷新
const MIN_AWAY_TIME = 5000; // 离开至少5秒才刷新

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    const now = Date.now();
    const awayTime = now - lastVisibilityTime;
    const timeSinceLastRefresh = now - lastRefreshTime;
    
    // 条件：离开超过5秒 且 距离上次刷新超过10秒 且 当前没有在刷新
    if (awayTime > MIN_AWAY_TIME && timeSinceLastRefresh > MIN_REFRESH_INTERVAL && !isRefreshing) {
      console.log('[导航页] 页面重新可见，刷新卡片数据');
      isRefreshing = true;
      lastRefreshTime = now;
      loadCards(true).finally(() => {
        isRefreshing = false;
      });
    }
    lastVisibilityTime = now;
  } else {
    lastVisibilityTime = Date.now();
  }
}

// 注册页面可见性监听
document.addEventListener('visibilitychange', handleVisibilityChange);

onUnmounted(() => {
  document.removeEventListener('click', closeFabMenu);
  document.removeEventListener('click', closeEngineDropdown);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
});

// 获取友情链接 logo（与首页卡片完全一致）
function getFriendLogo(friend) {
  // 1. 默认使用 CDN 自动生成（与卡片逻辑一致）
  const originUrl = getOriginUrl(friend.url);
  if (originUrl) {
    return `https://api.xinac.net/icon/?url=${originUrl}&sz=128`;
  }
  
  // 2. 如果 URL 解析失败，尝试使用数据库中的 logo
  if (friend.logo) {
    return friend.logo;
  }
  
  // 3. 默认图标
  return '/default-favicon.png';
}

// 获取网站源地址（用于友情链接 logo）
function getOriginUrl(url) {
  if (!url) return '';
  try {
    const urlObj = new URL(url);
    return urlObj.origin;
  } catch {
    return '';
  }
}

// CDN 备用源列表（用于友情链接 logo 降级）
const FRIEND_CDN_PROVIDERS = [
  (url) => `https://api.xinac.net/icon/?url=${url}&sz=128`,           // CDN 1: xinac (国内)
  (url) => `https://api.afmax.cn/so/ico/index.php?r=${url}&sz=128`,  // CDN 2: afmax (国内)
  (url) => `https://icon.horse/icon/${url}`,                          // CDN 3: icon.horse
  (url) => `https://www.google.com/s2/favicons?domain=${url}&sz=128`, // CDN 4: Google
  (url) => `https://favicon.im/${url}?larger=true`,                   // CDN 5: favicon.im
];

// 处理友情链接 logo 加载错误（CDN 降级）
function handleFriendLogoError(e, friend) {
  const currentSrc = e.target.src;
  const originUrl = getOriginUrl(friend.url);
  
  if (!originUrl) {
    e.target.src = '/default-favicon.png';
    return;
  }
  
  // 尝试切换到下一个 CDN
  for (let i = 0; i < FRIEND_CDN_PROVIDERS.length; i++) {
    const cdnUrl = FRIEND_CDN_PROVIDERS[i](originUrl);
    
    if (currentSrc.includes('api.xinac.net') && i === 0 ||
        currentSrc.includes('api.afmax.cn') && i === 1 ||
        currentSrc.includes('icon.horse') && i === 2 ||
        currentSrc.includes('www.google.com/s2/favicons') && i === 3 ||
        currentSrc.includes('favicon.im') && i === 4) {
      // 当前 CDN 失败，尝试下一个
      if (i + 1 < FRIEND_CDN_PROVIDERS.length) {
        e.target.src = FRIEND_CDN_PROVIDERS[i + 1](originUrl);
        return;
      }
      break;
    }
  }
  
  // 最后降级到默认图标
  e.target.src = '/default-favicon.png';
}

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
  await loadCards();
  
  // 预加载相邻分类的卡片（后台静默执行）
  preloadAdjacentCategories();
}

// 预加载相邻分类的卡片
function preloadAdjacentCategories() {
  if (!activeMenu.value || menus.value.length === 0) return;
  
  const currentIndex = menus.value.findIndex(m => m.id === activeMenu.value.id);
  const toPreload = [];
  
  // 预加载前后各1个分类
  [-1, 1].forEach(offset => {
    const idx = currentIndex + offset;
    if (idx >= 0 && idx < menus.value.length) {
      const menu = menus.value[idx];
      const key = getCardsCacheKey(menu.id, null);
      if (!cardsCache.value[key]) {
        toPreload.push({ menuId: menu.id, subMenuId: null, key });
      }
      // 预加载子菜单
      if (menu.subMenus?.length > 0) {
        const subKey = getCardsCacheKey(menu.id, menu.subMenus[0].id);
        if (!cardsCache.value[subKey]) {
          toPreload.push({ menuId: menu.id, subMenuId: menu.subMenus[0].id, key: subKey });
        }
      }
    }
  });
  
  // 当前菜单的子菜单也预加载
  if (activeMenu.value.subMenus?.length > 0) {
    activeMenu.value.subMenus.forEach(sub => {
      const key = getCardsCacheKey(activeMenu.value.id, sub.id);
      if (!cardsCache.value[key]) {
        toPreload.push({ menuId: activeMenu.value.id, subMenuId: sub.id, key });
      }
    });
  }
  
  // 后台静默预加载（不阻塞UI）
  toPreload.forEach(({ menuId, subMenuId, key }) => {
    getCards(menuId, subMenuId)
      .then(res => {
        cardsCache.value[key] = res.data;
        saveCardsCache();
      })
      .catch(() => {});
  });
}

// 加载所有分类的卡片（编辑模式用）
const allCategoryCards = ref({});

// 分类卡片缓存
const cardsCache = ref({});
const CARDS_CACHE_KEY = 'nav_cards_cache';
const CARDS_CACHE_TTL = 5 * 60 * 1000;

// 获取缓存key
function getCardsCacheKey(menuId, subMenuId) {
  return `${menuId}_${subMenuId || 'null'}`;
}

// 保存卡片缓存到localStorage
function saveCardsCache() {
  try {
    localStorage.setItem(CARDS_CACHE_KEY, JSON.stringify({
      data: cardsCache.value,
      timestamp: Date.now()
    }));
  } catch (e) {
    // 存储失败忽略
  }
}

async function loadCards(forceRefresh = false) {
  if (!activeMenu.value) return;
  
  // 如果选择了子菜单，只加载该子菜单的卡片
  if (activeSubMenu.value) {
    const cacheKey = getCardsCacheKey(activeMenu.value.id, activeSubMenu.value.id);
    
    // 优先使用内存缓存，实现秒切换（除非强制刷新）
    if (!forceRefresh && cardsCache.value[cacheKey]) {
      cards.value = cardsCache.value[cacheKey];
    }
    
    // 从服务器获取最新数据
    try {
      const res = await getCards(activeMenu.value.id, activeSubMenu.value.id, forceRefresh);
      cards.value = res.data;
      cardsCache.value[cacheKey] = res.data;
      saveCardsCache();
    } catch (error) {
      console.error('加载卡片失败:', error);
      if (!cardsCache.value[cacheKey]) {
        cards.value = [];
      }
    }
  } else {
    // 选择主菜单时，加载该主菜单下所有卡片（包括子菜单中的卡片）
    const allCardsInMenu = [];
    const subMenus = activeMenu.value.subMenus || [];
    
    // 先加载主菜单直接的卡片
    const mainCacheKey = getCardsCacheKey(activeMenu.value.id, null);
    try {
      // 优先使用缓存
      if (!forceRefresh && cardsCache.value[mainCacheKey]) {
        allCardsInMenu.push(...cardsCache.value[mainCacheKey]);
      } else {
        const res = await getCards(activeMenu.value.id, null, forceRefresh);
        cardsCache.value[mainCacheKey] = res.data;
        allCardsInMenu.push(...res.data);
      }
    } catch (error) {
      console.error('加载主菜单卡片失败:', error);
      if (cardsCache.value[mainCacheKey]) {
        allCardsInMenu.push(...cardsCache.value[mainCacheKey]);
      }
    }
    
    // 并行加载所有子菜单的卡片
    if (subMenus.length > 0) {
      const subPromises = subMenus.map(async (subMenu) => {
        const subCacheKey = getCardsCacheKey(activeMenu.value.id, subMenu.id);
        try {
          if (!forceRefresh && cardsCache.value[subCacheKey]) {
            return cardsCache.value[subCacheKey];
          }
          const res = await getCards(activeMenu.value.id, subMenu.id, forceRefresh);
          cardsCache.value[subCacheKey] = res.data;
          return res.data;
        } catch (error) {
          console.error(`加载子菜单 ${subMenu.name} 卡片失败:`, error);
          return cardsCache.value[subCacheKey] || [];
        }
      });
      
      const subResults = await Promise.all(subPromises);
      subResults.forEach(subCards => {
        allCardsInMenu.push(...subCards);
      });
    }
    
    cards.value = allCardsInMenu;
    saveCardsCache();
  }
}

// 加载所有卡片用于搜索（优化版：单次请求获取所有数据）
async function loadAllCardsForSearch() {
  try {
    const res = await getAllCards();
    const { cardsByCategory } = res.data;
    
    // 更新缓存
    Object.assign(cardsCache.value, cardsByCategory);
    saveCardsCache();
    
    // 合并所有卡片用于搜索
    allCards.value = Object.values(cardsByCategory).flat();
  } catch (error) {
    console.error('批量加载卡片失败，回退到逐个加载:', error);
    // 回退到逐个加载
    const promises = [];
    const keys = [];
    
    for (const menu of menus.value) {
      const key = getCardsCacheKey(menu.id, null);
      keys.push(key);
      promises.push(
        getCards(menu.id, null)
          .then(res => res.data)
          .catch(() => cardsCache.value[key] || [])
      );
      
      if (menu.subMenus && menu.subMenus.length) {
        for (const subMenu of menu.subMenus) {
          const subKey = getCardsCacheKey(menu.id, subMenu.id);
          keys.push(subKey);
          promises.push(
            getCards(menu.id, subMenu.id)
              .then(res => res.data)
              .catch(() => cardsCache.value[subKey] || [])
          );
        }
      }
    }
    
    const results = await Promise.all(promises);
    results.forEach((data, index) => {
      if (data && data.length > 0) {
        cardsCache.value[keys[index]] = data;
      }
    });
    saveCardsCache();
    allCards.value = results.flat();
  }
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
    // 1. 解析 URL
    const response = await batchParseUrls(urls);
    
    // 2. 获取所有现有卡片，用于重复检测
    const existingCardsRes = await getCards(activeMenu.value.id, activeSubMenu.value?.id);
    const existingCards = existingCardsRes.data;
    
    // 3. 检测重复并标记
    parsedCards.value = response.data.data.map(card => {
      // 为每个卡片智能推荐标签
      const recommendedTagIds = recommendTags(card.url, card.title);
      
      // 检测与现有卡片重复
      const duplicateCard = existingCards.find(existing => 
        isDuplicateCard({ title: card.title, url: card.url }, existing)
      );
      
      const isDuplicate = !!duplicateCard;
      
      return {
        ...card,
        selected: !isDuplicate, // 重复的默认不选中
        isDuplicate: isDuplicate, // 标记是否重复
        duplicateOf: duplicateCard ? {
          id: duplicateCard.id,
          title: duplicateCard.title,
          url: duplicateCard.url
        } : null,
        tagIds: recommendedTagIds,
        recommendedTagIds: recommendedTagIds
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
    
    const response = await batchAddCards(
      activeMenu.value.id,
      activeSubMenu.value?.id || null,
      cardsToAdd
    );
    
    // 构建结果消息
    const added = response.data.added || 0;
    const skipped = response.data.skipped || 0;
    const skippedCards = response.data.skippedCards || [];
    
    let message = '';
    
    if (added > 0 && skipped === 0) {
      // 全部成功
      message = `✅ 成功添加 ${added} 个网站！`;
    } else if (added > 0 && skipped > 0) {
      // 部分成功
      message = `✅ 成功添加 ${added} 个网站\n\u26a0️ 跳过 ${skipped} 个重复的网站\n\n重复的网站：\n${skippedCards.map((card, i) => `${i + 1}. ${card.title} (${card.reason})`).join('\n')}`;
    } else {
      // 全部跳过
      message = `\u26a0️ 所有网站都是重复的，未添加任何卡片\n\n重复的网站：\n${skippedCards.map((card, i) => `${i + 1}. ${card.title}\n   与现有卡片“${card.duplicateOf?.title || ''}”重复`).join('\n')}`;
    }
    
    alert(message);
    
    // 关闭弹窗并强制刷新卡片列表（不使用缓存）
    closeBatchAdd();
    await loadCards(true);
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
    
    // 将图片转换为 Base64 存储，实现秒加载
    const base64Data = await convertImageToBase64(wallpaperUrl);
    
    // 更新背景 - 直接更新或创建 <style> 标签，使用 !important 覆盖
    let bgStyle = document.getElementById('dynamic-bg-style');
    if (!bgStyle) {
      bgStyle = document.createElement('style');
      bgStyle.id = 'dynamic-bg-style';
      document.head.appendChild(bgStyle);
    }
    bgStyle.textContent = `.home-container { background-image: url(${base64Data}) !important; }`;
    
    // 保存 Base64 到 localStorage，下次刷新时秒加载
    localStorage.setItem('nav_background', base64Data);
  } catch (error) {
    console.error('获取壁纸失败:', error);
    alert('获取壁纸失败，请稍后重试');
  } finally {
    bgLoading.value = false;
  }
}

// 将远程图片转换为 Base64
async function convertImageToBase64(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        // 限制最大尺寸以控制 Base64 大小
        const maxSize = 1920;
        let width = img.width;
        let height = img.height;
        
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = Math.round(height * maxSize / width);
            width = maxSize;
          } else {
            width = Math.round(width * maxSize / height);
            height = maxSize;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // 使用 JPEG 格式，质量 0.8，平衡大小和质量
        const base64 = canvas.toDataURL('image/jpeg', 0.8);
        resolve(base64);
      } catch (e) {
        // 如果转换失败，返回原始 URL
        console.warn('Base64 转换失败，使用原始 URL:', e);
        resolve(url);
      }
    };
    
    img.onerror = () => {
      // 加载失败时返回原始 URL
      console.warn('图片加载失败，使用原始 URL');
      resolve(url);
    };
    
    img.src = url;
  });
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
    
    // 本地更新卡片顺序，避免重新加载导致的闪烁
    const reorderedCards = cardIds.map(id => {
      return cards.value.find(c => c.id === id) || allCards.value.find(c => c.id === id);
    }).filter(Boolean);
    
    // 更新当前显示的卡片列表
    if (reorderedCards.length > 0) {
      cards.value = reorderedCards;
    }
    
    // 后台静默更新缓存（不影响当前显示）
    setTimeout(() => {
      if (editMode.value) {
        loadAllCards();
      }
    }, 500);
    
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
    
    // 同步更新缓存
    const cacheKey = getCardsCacheKey(activeMenu.value?.id, activeSubMenu.value?.id);
    if (cardsCache.value[cacheKey]) {
      cardsCache.value[cacheKey] = cards.value;
      saveCardsCache();
    }
    
    showToastMessage('删除成功');
  } catch (error) {
    // 如果是认证失败，清除token并提示重新验证
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('nav_password_token');
      editMode.value = false;
      alert('登录已过期，请重新进入编辑模式');
    } else {
      alert('删除失败：' + (error.response?.data?.error || error.message));
    }
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
  // 重置标签搜索和快速创建状态
  tagSearchQuery.value = '';
  showQuickAddTag.value = false;
  quickTagName.value = '';
  quickTagColor.value = '#1890ff';
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

// 过滤后的可用标签（支持搜索）
const filteredAvailableTags = computed(() => {
  const query = tagSearchQuery.value.trim().toLowerCase();
  if (!query) return availableTagsForEdit.value;
  return availableTagsForEdit.value.filter(tag => 
    tag.name.toLowerCase().includes(query)
  );
});

// 快速创建标签
async function createQuickTag() {
  const name = quickTagName.value.trim();
  if (!name) return;
  
  try {
    const { addTag: apiAddTag } = await import('../api');
    const maxOrder = allTags.value.length
      ? Math.max(...allTags.value.map(t => t.order || 0))
      : 0;
    
    const res = await apiAddTag({
      name: name,
      color: quickTagColor.value,
      order: maxOrder + 1
    });
    
    // 添加到标签列表
    const newTag = res.data;
    allTags.value.push(newTag);
    
    // 自动选中新创建的标签
    cardEditForm.value.tagIds.push(newTag.id);
    
    // 重置表单
    quickTagName.value = '';
    quickTagColor.value = '#1890ff';
    showQuickAddTag.value = false;
  } catch (err) {
    alert('创建标签失败：' + (err.response?.data?.error || err.message));
  }
}

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
    // 如果是认证失败，清除token并提示重新验证
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('nav_password_token');
      editError.value = '登录已过期，请重新进入编辑模式';
      // 关闭编辑弹窗并退出编辑模式
      setTimeout(() => {
        closeEditCardModal();
        editMode.value = false;
        showToastMessage('请重新进入编辑模式');
      }, 1500);
    } else {
      editError.value = '修改失败：' + (error.response?.data?.error || error.message);
    }
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
  background: linear-gradient(135deg, #1890ff 0%, #69c0ff 100%);
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

.engine-menu-row {
  display: flex;
  align-items: center;
  padding-right: 8px;
}

.engine-menu-row:hover {
  background: rgba(102, 126, 234, 0.05);
}

.engine-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
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
  color: #1890ff;
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

.engine-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.2s;
}

.engine-menu-row:hover .engine-actions {
  opacity: 1;
}

.engine-sort-btn {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  background: rgba(102, 126, 234, 0.1);
  border: none;
  color: #1890ff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.engine-sort-btn:hover {
  background: #1890ff;
  color: white;
}

.delete-engine-btn-small {
  width: 22px;
  height: 22px;
  border-radius: 4px;
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
  background: linear-gradient(135deg, #1890ff 0%, #69c0ff 100%);
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
  background-image: url('/background.webp');
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

.mini-tag-clear-all {
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid #ddd;
  border-radius: 12px;
  padding: 4px 10px;
  font-size: 12px;
  color: #666;
  cursor: pointer;
  transition: all 0.2s;
}

.mini-tag-clear-all:hover {
  background: #ff4d4f;
  color: white;
  border-color: #ff4d4f;
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
  color: #1890ff;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
}

.mini-tag-btn:hover {
  background: #1890ff;
  color: white;
  border-color: #1890ff;
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
  background: linear-gradient(135deg, #1890ff 0%, #69c0ff 100%);
}

.tag-panel-header h4 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: white;
}

.tag-panel-header h4 .selected-count {
  font-size: 14px;
  font-weight: 400;
  opacity: 0.9;
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

.panel-tag-btn .tag-check {
  margin-left: 2px;
  font-size: 12px;
}

.tag-panel-footer {
  padding: 12px 20px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: flex-end;
}

.clear-all-btn {
  background: #ff4d4f;
  color: white;
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.clear-all-btn:hover {
  background: #ff7875;
  transform: translateY(-1px);
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

.promo-space {
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
.promo-space a {
  width: 100%;
  display: block;
}
.promo-space img {
  width: 100%;
  max-width: 90px;
  max-height: 160px;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.12);
  background: #fff;
  object-fit: contain;
  margin: 0 auto;
}

.promo-placeholder {
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

.promo-space-fixed {
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
.left-promo-fixed {
  left: 0;
}
.right-promo-fixed {
  right: 0;
}
.promo-space-fixed a {
  width: 100%;
  display: block;
}
.promo-space-fixed img {
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
  
  .promo-space {
    width: 100%;
    height: 100px;
  }
  
  .promo-placeholder {
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
  
  .promo-space {
    height: 60px;
  }
  
  .promo-placeholder {
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
  background: linear-gradient(135deg, #1890ff, #69c0ff);
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
  border-color: #1890ff;
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

.tag-search-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.tag-search-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
}

.tag-search-input:focus {
  border-color: #1890ff;
}

.quick-add-tag-btn {
  padding: 8px 12px;
  background: #1890ff;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.quick-add-tag-btn:hover {
  background: #40a9ff;
}

.quick-add-tag-form {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 10px;
  background: #f0f7ff;
  border-radius: 8px;
  border: 1px dashed #1890ff;
}

.quick-tag-name-input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 13px;
  outline: none;
}

.quick-tag-name-input:focus {
  border-color: #1890ff;
}

.quick-tag-color-input {
  width: 32px;
  height: 32px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  cursor: pointer;
  padding: 2px;
}

.quick-tag-create-btn {
  padding: 6px 14px;
  background: #52c41a;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.quick-tag-create-btn:hover:not(:disabled) {
  background: #73d13d;
}

.quick-tag-create-btn:disabled {
  background: #d9d9d9;
  cursor: not-allowed;
}

.available-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 150px;
  overflow-y: auto;
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

.no-tags-hint {
  color: #999;
  font-size: 13px;
  font-style: italic;
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
  background: linear-gradient(135deg, #1890ff, #69c0ff);
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

/* 重复卡片样式 */
.batch-preview-item.is-duplicate .batch-card-preview {
  background: #fef2f2;
  border: 2px solid #fca5a5;
  position: relative;
}

.batch-preview-item.is-duplicate .batch-card-preview:hover {
  background: #fee2e2;
  border-color: #f87171;
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
  border-color: #1890ff;
}

/* 重复徽章 */
.duplicate-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: #dc2626;
  color: white;
  font-size: 12px;
  font-weight: 600;
  border-radius: 6px;
  box-shadow: 0 2px 6px rgba(220, 38, 38, 0.3);
}

.duplicate-badge svg {
  stroke-width: 2.5;
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

/* 重复信息 */
.batch-card-duplicate-info {
  font-size: 13px;
  color: #dc2626;
  margin: 8px 0 0 0;
  padding: 8px;
  background: #fee2e2;
  border: 1px solid #fca5a5;
  border-radius: 6px;
  line-height: 1.5;
}

.batch-card-duplicate-info strong {
  font-weight: 600;
  color: #b91c1c;
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
  border-color: #1890ff;
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
  accent-color: #1890ff;
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
  background: linear-gradient(135deg, #1890ff 0%, #69c0ff 100%);
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
  background: linear-gradient(135deg, #1890ff 0%, #69c0ff 100%);
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
  border-color: #1890ff;
}

.target-menu-btn.active,
.target-submenu-btn.active {
  background: linear-gradient(135deg, #1890ff 0%, #69c0ff 100%);
  color: white;
  border-color: #1890ff;
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

/* 骨架屏已移除 */
</style>
