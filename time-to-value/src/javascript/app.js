Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    items: [
        {xtype:'container',itemId:'message_box',tpl:'Hello, <tpl>{_refObjectName}</tpl>'},
        {xtype:'container',itemId:'display_box', margin: 10},
        {xtype:'tsinfolink'}
    ],
    launch: function() {
        if (this.isExternal()){
            this.showSettings(this.config);
        } else {
            this.onSettingsUpdate(this.getSettings());  
        }
        
    },
    _preProcess: function() {
        var pi_type = this.getSetting('pi_type');
        this._getKanbanStatesForType(pi_type).then({
            scope: this,
            success: function(allowed_values){
                this.logger.log('allowed states', allowed_values);
                // get all the items for each state except the first and last
                var states_to_check = Ext.clone(allowed_values);
                states_to_check.pop();
                states_to_check.shift();
                this._calculateQueueTimes(pi_type,states_to_check).then({
                    scope: this,
                    success: function(summaries){
                        this._makeGrid(summaries);
                    },
                    failure:function(msg){
                        this.down('#display_box').add({html: 'Problem loading items: ' + msg});
                    }
                });
            },
            failure: function(msg) { 
                this.down('#display_box').add({html: 'Problem loading allowed values: ' + msg});
            }
        });
    },
    _calculateQueueTimes:function(pi_type,states_to_check){
        var deferred = Ext.create('Deft.Deferred');
        this._getItemsInState(pi_type,states_to_check).then({
            scope: this,
            success: function(current_items){
                this.logger.log('items in states', current_items);

                var summary_by_current_state = this._arrangeDataByState(states_to_check,current_items);
                this.logger.log(summary_by_current_state);

                var promises = [];
                
                Ext.Object.each(summary_by_current_state, function(state,summary){
                    promises.push( this._calculateQueueTimesForState(state,summary) );
                },this);
                
                Deft.Promise.all(promises).then({
                    scope: this,
                    success: function(summaries) {
                        var total_time = 0;
                        Ext.Array.each(summaries, function(summary){
                            var time_in_state = summary.time_in_state || 0;
                            total_time = total_time + time_in_state;
                        });
                        summaries.push({
                            total_line: true,
                            time_in_state: total_time,
                            State:'Time to Value',
                            items: []
                        });
                        deferred.resolve(summaries);
                    }
                
                });
            },
            failure: function(msg) { 
                this.down('#display_box').add({html: 'Problem loading current values: ' + msg});
            }
        });
        return deferred;
    },
    _makeGrid: function(summaries){
        this.logger.log("_makeGrid",summaries);
        var store = Ext.create('Rally.data.custom.Store',{
            data: summaries
        });
        
        this.down('#display_box').add({
            xtype:'rallygrid',
            store: store,
            showPagingToolbar: false,
            showRowActionsColumn : false,
            disableSelection     : true,
            columnCfgs: [
                { text: 'In State', dataIndex: 'State', renderer: function(value,meta_data,record) {
                        if ( record.get('total_line') ) {
                            meta_data.style = "background-color:#F0F0F5";
                        }
                        return value;
                    }
                },
                { text: 'Average Number of Days', dataIndex: 'time_in_state', renderer: function(value,meta_data,record){
                        if ( !value && value !== 0 ) {
                            return "No data found";
                        }
                        if ( record.get('total_line') ) {
                            meta_data.style = "background-color:#F0F0F5";
                        }
                        return Ext.util.Format.number(value,'0.0');
                    }
                }
            ],
            listeners: {
                scope: this,
                itemclick: function(view, record, item, index, evt) {
                    if ( !record.get('total_line') ) {
                        var title = "Records in " + record.get('State');
                        var records = record.get('items');
                        
                        this.showDetailPopup(title, records);
                    }
                }
            }
        });
    },
    _getKanbanStatesForType: function(pi_type) {
        var deferred = Ext.create('Deft.Deferred');
        this.logger.log("_getKanbanStatesForType", pi_type);
        
        Rally.data.ModelFactory.getModel({
            type: pi_type,
            success: function(model) {
                model.getField('State').getAllowedValueStore().load({
                    callback: function(records, operation, success) {
                        var allowed_values = [];
                        
                        Ext.Array.each(records, function(allowedValue) {
                            //each record is an instance of the AllowedAttributeValue model 
                            allowed_values.push(allowedValue.get('StringValue'));
                        });
                        deferred.resolve(allowed_values);
                    }
                });
            }
        });
        return deferred;
    },
    _calculateQueueTimesForState: function(state,summary) {
        var deferred = Ext.create('Deft.Deferred');
        this.logger.log("_getQueueTimesByState",state,summary);
        
        var oids = [];
        var items = summary.items;
        Ext.Array.each(items,function(item){
            oids.push(item.get('ObjectID'));
        });
                    
        var project_oid = this.getContext().getProject().ObjectID;
        
        Ext.create('Rally.data.lookback.SnapshotStore',{
            autoLoad: true,
            fetch: ['Name','_ValidFrom'],
            sorters: [{property:'_ValidFrom',direction:'DESC'}],
            filters: [
                {
                    property: '_ProjectHierarchy',
                    value: project_oid
                },
                {
                    property: 'ObjectID',
                    operator: 'in',
                    value: oids
                },
                {
                    property: 'State',
                    value: state
                },
                {
                    property: '_PreviousValues.State',
                    operator: '!=',
                    value: state
                }
            ],
            listeners: {
                scope: this,
                load: function(store,records) {
                    summary.State = state;
                    var records_to_keep = [];
                    var times_in_state = [];
                    var oids_in_state = [];
                    
                    Ext.Array.each(records,function(record){
                        if ( !Ext.Array.contains(oids_in_state, record.get('ObjectID'))) {
                            var time_in_state = this._getTimeInState(record);
                            times_in_state.push(time_in_state);
                            record.set('__TimeInState', time_in_state);
                            records_to_keep.push(record);
                        }
                        oids_in_state.push(record.get('ObjectID'));
                    },this); 
                    
                    summary.time_in_state = Ext.Array.mean(times_in_state);
                    summary.items = records_to_keep;
                    summary.total_line = false;
                    
                    deferred.resolve(summary);
                }
            }
        });
        return deferred;
    },
    _getTimeInState: function(record){
        this.logger.log(record.get('_ValidFrom'));
        var today = new Date();
        var in_state_since = Rally.util.DateTime.fromIsoString(record.get('_ValidFrom'));
        
//        this.logger.log(today, in_state_since, Rally.util.DateTime.getDifference(today,in_state_since,'day'));
        return Rally.util.DateTime.getDifference(today,in_state_since,'day');
    },
    _getItemsInState: function(pi_type,states_to_check){
        var deferred = Ext.create('Deft.Deferred');
        this.logger.log("_getItemsInState",pi_type,states_to_check);
        var project_oid = this.getContext().getProject().ObjectID;
        
        Ext.create('Rally.data.lookback.SnapshotStore',{
            autoLoad: true,
            fetch: ['State','Name'],
            hydrate: ['State'],
            filters: [
                {
                    property: '_ProjectHierarchy',
                    value: project_oid
                },
                {
                    property: '__At',
                    value: 'current'
                },
                {
                    property: '_TypeHierarchy',
                    value: pi_type
                },
                {
                    property: 'State',
                    operator: 'in',
                    value: states_to_check
                }
            ],
            listeners: {
                scope: this,
                load: function(store,records) {
                    deferred.resolve(records);
                }
            }
        });
        return deferred;
    },
    _arrangeDataByState: function(allowed_states,current_items){
        this.logger.log("_arrangeDataByState");
        var items_by_state = {};
        
        Ext.Array.each(allowed_states,function(allowed_state){
            items_by_state[allowed_state] = {time_in_state:null, items:[]};
        });
        
        Ext.Array.each(current_items,function(item){
            var state = item.get('State');
            if ( !items_by_state[state] ) { items_by_state[state] = {cycle_time:null, items: []}; }
            
            items_by_state[state].items.push(item);
        });
        
        return items_by_state;
    },
    showDetailPopup: function(title, records) {
        var type_path = Ext.util.Format.lowercase(this.getSetting('pi_type'));
        
        var detail_url_path = 'https://' + (window.location.hostname || 'rally1.rallydev.com') + '/#/detail/' + type_path + '/';
        
        var base_columns = [{
            text      : 'Name',
            dataIndex : 'Name',
            flex: 1,
            renderer  : function(val, meta_data, record) {
                return '<a href="' + detail_url_path + record.get('ObjectID') + '" target="_blank">' + val + '</a>';
            }
        },                
        /*{ text: 'Date', dataIndex: '_ValidFrom' },*/
        {
            text      : 'Days in Queue',
            dataIndex : '__TimeInState'
        }];
        
        var columns = Ext.Array.push(base_columns,[]);
        
        Ext.create('Rally.ui.dialog.Dialog', {
            id        : 'detailPopup',
            title     : title,
            width     : Ext.getBody().getWidth() - 25,
            height    : Ext.getBody().getHeight() - 25,
            closable  : true,
            layout    : 'fit',
            items     : [{
                xtype                : 'rallygrid',
                showPagingToolbar    : false,
                showRowActionsColumn : false,
                disableSelection     : true,
                columnCfgs           : columns,
                store : Ext.create('Rally.data.custom.Store', {
                    pageSize : 1000000,
                    data     : records
                })
            }]
        }).show();
    },
    /********************************************
    /* Overrides for App class
    /*
    /********************************************/
    //getSettingsFields:  Override for App    
    getSettingsFields: function() {
        var me = this;
        
        return [{
            name: 'pi_type',
            xtype: 'rallyportfolioitemtypecombobox',
            fieldLabel: 'PI Type:',
            valueField: 'TypePath',
            labelWidth: 75,
            width: 400,
            margin: 10,
            autoExpand: true,
            alwaysExpanded: true,
            readyEvent: 'ready'
        }];
    },
    //showSettings:  Override to add showing when external + scrolling
    showSettings: function(options) {
        this.logger.log("showSettings",options);
        this._appSettings = Ext.create('Rally.app.AppSettings', Ext.apply({
            fields: this.getSettingsFields(),
            settings: this.getSettings(),
            defaultSettings: this.getDefaultSettings(),
            context: this.getContext(),
            settingsScope: this.settingsScope
        }, options));

        this._appSettings.on('cancel', this._hideSettings, this);
        this._appSettings.on('save', this._onSettingsSaved, this);
        
        if (this.isExternal()){
            if (this.down('#display_box').getComponent(this._appSettings.id)==undefined){
                this.down('#display_box').add(this._appSettings);
            }
        } else {
            this.hide();
            this.up().add(this._appSettings);
        }
        return this._appSettings;
    },
    _onSettingsSaved: function(settings){
        this.logger.log('_onSettingsSaved',settings);
        Ext.apply(this.settings, settings);
        this._hideSettings();
        this.onSettingsUpdate(settings);
    },
    //onSettingsUpdate:  Override
    onSettingsUpdate: function (settings){
        //Build and save column settings...this means that we need to get the display names and multi-list
        this.logger.log('onSettingsUpdate',settings);
        
        var type = this.getSetting('type');
        if (this.getSetting('pi_type') ) {
            this._preProcess();
        } else {
            this.down('#display_box').add({xtype:'container',html:'Use the App Settings... on the gear to choose a PI type'});
        }
    },
    isExternal: function(){
      return typeof(this.getAppId()) == 'undefined';
    }
});