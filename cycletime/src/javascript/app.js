Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    model: 'PortfolioItem/EPIC',
    group_field: 'State',
    items: [
        {xtype:'container',itemId:'selector_box', layout: { type:'hbox' }, defaults: { margin: 5 }},
        {xtype:'container',itemId:'display_box'},
        {xtype:'tsinfolink'}
    ],
    launch: function() {
        this._addSelectors(this.down('#selector_box'));
    },
    _addSelectors: function(container){
        container.add({
            xtype:'rallyfieldvaluecombobox',
            model: this.model,
            field: this.group_field,
            labelWidth: 75,
            fieldLabel: 'Starting State',
            stateful: true,
            stateEvents: ['change'],
            stateId: 'rally.technicalservices.cycletime.start_value',
            listeners: {
                scope: this,
                change: function(combo) {
                    this.start_state = combo.getRecord();
                    this._enableButtonIfNecessary();
                }
            }
        });
        container.add({
            xtype:'rallyfieldvaluecombobox',
            model: this.model,
            field: this.group_field,
            labelWidth: 75,
            fieldLabel: 'Ending State',
            stateful: true,
            stateEvents: ['change'],
            stateId: 'rally.technicalservices.cycletime.end_value',
            listeners: {
                scope: this,
                change: function(combo) {
                    this.end_state = combo.getRecord();
                    this._enableButtonIfNecessary();
                }
            }
        });
        container.add({
            xtype:'rallybutton',
            text:'Calculate...',
            disabled: true,
            itemId: 'calculate_button'
        });
    },
    _enableButtonIfNecessary: function() {
        this.logger.log("Start/End",this.start_state, this.end_state);
        this.down('#calculate_button').setDisabled(true);


        if ( this.end_state && this.start_state ) {
            var start_store = this.start_state.store;
            var end_store = this.end_state.store;
            this.logger.log(start_store.indexOf(this.start_state), end_store.indexOf(this.end_state));
            if (start_store.indexOf(this.start_state) < end_store.indexOf(this.end_state)) {
                this.down('#calculate_button').setDisabled(false);
            }
        }
    },
    _loadAStoreWithAPromise: function(model_name, model_fields){
        var deferred = Ext.create('Deft.Deferred');
        
        var defectStore = Ext.create('Rally.data.wsapi.Store', {
            model: model_name,
            fetch: model_fields,
            autoLoad: true,
            listeners: {
                load: function(store, records, successful) {
                    if (successful){
                        deferred.resolve(store);
                    } else {
                        deferred.reject('Failed to load store for model [' + model_name + '] and fields [' + model_fields.join(',') + ']');
                    }
                }
            }
        });
        return deferred.promise;
    }
});